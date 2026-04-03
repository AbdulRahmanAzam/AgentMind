import * as vscode from 'vscode';
import {
  AgentRole,
  AgentState,
  ToolCallResult,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import { AgentLLM } from '../llm/modelAccess.js';
import { buildTeammateSystemPrompt } from '../llm/agentPrompts.js';
import { getToolsForRole } from '../llm/toolDefinitions.js';
import { AgentPseudoterminal } from '../terminal/agentTerminal.js';
import { FileToolHandlers } from '../tools/fileTools.js';
import { TerminalToolHandlers } from '../tools/terminalTools.js';
import { CommunicationToolHandlers } from '../tools/communicationTools.js';
import { CodeToolHandlers } from '../tools/codeTools.js';
import { TaskList } from '../communication/taskList.js';
import { Mailbox } from '../communication/mailbox.js';
import { writeAgentState } from '../storage/workspace.js';
import { Logger } from '../utils/logger.js';

/**
 * An autonomous teammate agent that runs in a loop:
 * check messages → pick a task → work on it → report results.
 *
 * Each TeammateAgent has its own LLM instance, PTY for output,
 * and set of tool handlers scoped to its role.
 */
export class TeammateAgent {
  readonly agentId: string;
  readonly role: AgentRole;

  private readonly llm: AgentLLM;
  private readonly pty: AgentPseudoterminal;
  private readonly taskList: TaskList;
  private readonly mailbox: Mailbox;
  private readonly workspaceRoot: string;
  private readonly toolHandlers: Map<string, (input: unknown) => Promise<ToolCallResult>>;

  private active = false;
  private currentTaskId: string | null = null;
  private completedTaskIds: string[] = [];
  private messagesProcessed = 0;
  private startedAt: string;

  constructor(options: {
    agentId: string;
    role: AgentRole;
    pty: AgentPseudoterminal;
    taskList: TaskList;
    mailbox: Mailbox;
    workspaceRoot: string;
    taskDescription: string;
    teammateIds: string[];
  }) {
    this.agentId = options.agentId;
    this.role = options.role;
    this.pty = options.pty;
    this.taskList = options.taskList;
    this.mailbox = options.mailbox;
    this.workspaceRoot = options.workspaceRoot;
    this.startedAt = new Date().toISOString();

    // Build LLM instance with role-specific prompt & tools
    const systemPrompt = buildTeammateSystemPrompt(options.role, {
      leadId: AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
      teammateIds: options.teammateIds,
      taskDescription: options.taskDescription,
    });

    const tools = getToolsForRole(options.role.id, false);
    this.llm = new AgentLLM(this.agentId, systemPrompt, tools);

    // Register tool handlers
    this.toolHandlers = this.registerToolHandlers();
  }

  /** Assign the shared model to this agent's LLM instance. */
  setModel(model: vscode.LanguageModelChat): void {
    this.llm.setModel(model);
  }

  /** Inject additional system context (e.g. AGENTMIND.md contents). */
  addSystemContext(context: string): void {
    this.llm.addSystemContext(context);
  }

  /**
   * Start the autonomous agent loop. Runs until `shutdown()` is called
   * or the cancellation token fires.
   *
   * This should be called in a fire-and-forget fashion with error handling.
   */
  async start(token: vscode.CancellationToken): Promise<void> {
    this.active = true;
    this.pty.writeInfo('Agent started — entering work loop.');

    try {
      while (this.active && !token.isCancellationRequested) {
        // 0. Heartbeat
        await this.writeHeartbeat();

        // 1. Check pause
        if (this.pty.isPauseRequested()) {
          this.pty.writeInfo('Paused by user. Resuming after current iteration...');
        }

        // 2. Check & process messages
        await this.checkMessages(token);

        // 3. Check for shutdown signals
        if (!this.active) {
          break;
        }

        // 4. Pick next task
        const taskId = await this.pickNextTask();

        if (taskId) {
          // 5. Work on the task
          this.currentTaskId = taskId;
          await this.writeHeartbeat();
          await this.workOnTask(taskId, token);
          this.currentTaskId = null;
        } else {
          // No tasks available — wait and try again
          this.pty.writeInfo('No tasks available. Checking again...');
          await this.delay(3000);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(`[${this.agentId}] Agent loop error: ${message}`);
      this.pty.writeError(`Agent loop error: ${message}`);
    } finally {
      this.active = false;
      this.pty.writeInfo('Agent loop ended.');
      await this.writeHeartbeat('shutdown');
    }
  }

  /** Signal the agent to stop after the current operation. */
  shutdown(): void {
    this.active = false;
    this.pty.writeInfo('Shutdown requested — finishing current operation...');
  }

  /** Whether this agent is still running. */
  isActive(): boolean {
    return this.active;
  }

  // ─── Private: work cycle ──────────────────────────────────────

  private async checkMessages(token: vscode.CancellationToken): Promise<void> {
    try {
      const messages = await this.mailbox.getUnreadMessages(this.agentId);
      if (messages.length === 0) {
        return;
      }

      for (const msg of messages) {
        this.pty.writeMessage(msg.from, msg.content);
        this.messagesProcessed++;

        // Check for shutdown command from system
        if (msg.type === 'system' && msg.content.includes('SHUTDOWN')) {
          this.pty.writeInfo('Received shutdown signal from lead.');
          this.shutdown();
          return;
        }
      }

      // Mark non-broadcast messages as read
      const directIds = messages
        .filter((m) => m.type !== 'broadcast')
        .map((m) => m.id);
      if (directIds.length > 0) {
        await this.mailbox.markAsRead(this.agentId, directIds);
      }

      // Feed messages into LLM context so the agent can react
      if (messages.length > 0 && this.active) {
        const summary = messages
          .map((m) => `[${m.from}]: ${m.content}`)
          .join('\n');

        // Use LLM to process messages and decide action
        await this.llm.runAgentLoop(
          `You received the following messages from your team:\n\n${summary}\n\nProcess these messages and take any necessary action. If no action is needed, just acknowledge.`,
          this.toolHandlers,
          token,
          (text) => this.pty.writeThinking(text),
          (toolName, input) =>
            this.pty.writeToolCall(toolName, JSON.stringify(input).slice(0, 100)),
        );
      }
    } catch (err) {
      Logger.warn(`[${this.agentId}] Error checking messages: ${err}`);
    }
  }

  private async pickNextTask(): Promise<string | null> {
    try {
      // First check for tasks directly assigned to us
      const myTasks = await this.taskList.getTasksByAgent(this.agentId);
      const pendingOwn = myTasks.find(
        (t) => t.status === 'pending' && t.blockedBy.length === 0,
      );
      if (pendingOwn) {
        return pendingOwn.id;
      }

      // Then check for unclaimed tasks matching our expertise
      const available = await this.taskList.getAvailableTasks();
      const matchingTask = available.find((t) => !t.assignedTo || t.assignedTo === this.agentId);
      if (matchingTask) {
        return matchingTask.id;
      }

      return null;
    } catch (err) {
      Logger.warn(`[${this.agentId}] Error picking task: ${err}`);
      return null;
    }
  }

  private async workOnTask(
    taskId: string,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const task = await this.taskList.getTask(taskId);
    if (!task) {
      this.pty.writeError(`Task ${taskId} not found.`);
      return;
    }

    this.pty.writeTaskUpdate(taskId, `Starting: "${task.title}"`);

    // Claim the task
    const claimed = await this.taskList.claimTask(taskId, this.agentId);
    if (!claimed) {
      this.pty.writeInfo(`Task ${taskId} already claimed — skipping.`);
      return;
    }

    this.pty.writeTaskUpdate(taskId, 'Claimed — beginning work');

    try {
      const instruction = `You have been assigned the following task. Complete it thoroughly.

## Task: ${task.title}
## ID: ${task.id}
## Priority: ${task.priority}
## Description:
${task.description}

Work through this task step by step:
1. First understand the existing codebase relevant to this task
2. Plan your approach
3. Implement the changes
4. Verify your work (run build/tests if applicable)
5. Report completion with updateTaskStatus

Remember: use claimTask first, then do the work, then updateTaskStatus when done.
You have already claimed this task. Proceed with the implementation.`;

      await this.llm.runAgentLoop(
        instruction,
        this.toolHandlers,
        token,
        (text) => this.pty.writeThinking(text),
        (toolName, input) =>
          this.pty.writeToolCall(toolName, JSON.stringify(input).slice(0, 100)),
      );

      // If the LLM didn't explicitly complete the task, mark it done
      const updatedTask = await this.taskList.getTask(taskId);
      if (updatedTask && updatedTask.status === 'in-progress') {
        await this.taskList.completeTask(taskId, 'Completed by agent', []);
        await this.taskList.unblockDependents(taskId);
      }

      this.completedTaskIds.push(taskId);
      this.pty.writeSuccess(`Task ${taskId} completed.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.pty.writeError(`Task ${taskId} failed: ${message}`);

      try {
        await this.taskList.failTask(taskId, message);
        await this.mailbox.sendDirectMessage(
          this.agentId,
          AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
          `Task ${taskId} failed: ${message}`,
        );
      } catch {
        // Best-effort failure reporting
      }
    }
  }

  // ─── Tool registration ────────────────────────────────────────

  private registerToolHandlers(): Map<string, (input: unknown) => Promise<ToolCallResult>> {
    const handlers = new Map<string, (input: unknown) => Promise<ToolCallResult>>();
    const fileTools = new FileToolHandlers(this.workspaceRoot);
    const terminalTools = new TerminalToolHandlers(this.workspaceRoot);
    const commTools = new CommunicationToolHandlers(
      this.agentId,
      this.taskList,
      this.mailbox,
    );
    const codeTools = new CodeToolHandlers(this.workspaceRoot);

    // File tools
    handlers.set('readFile', (input) => fileTools.readFile(input as { path: string; startLine?: number; endLine?: number }));
    handlers.set('writeFile', (input) => fileTools.writeFile(input as { path: string; content: string }));
    handlers.set('editFile', (input) => fileTools.editFile(input as { path: string; oldString: string; newString: string }));
    handlers.set('searchFiles', (input) => fileTools.searchFiles(input as { pattern: string }));
    handlers.set('searchText', (input) => fileTools.searchText(input as { query: string; includePattern?: string }));
    handlers.set('listDirectory', (input) => fileTools.listDirectory(input as { path: string }));

    // Terminal tools
    handlers.set('runCommand', (input) => terminalTools.runCommand(input as { command: string; cwd?: string }));

    // Communication tools
    handlers.set('sendMessage', (input) => commTools.sendMessage(input as { to: string; content: string }));
    handlers.set('broadcastMessage', (input) => commTools.broadcastMessage(input as { content: string }));
    handlers.set('checkInbox', (input) => commTools.checkInbox(input as Record<string, never>));
    handlers.set('getTaskList', (input) => commTools.getTaskList(input as Record<string, never>));
    handlers.set('updateTaskStatus', (input) => commTools.updateTaskStatus(input as { taskId: string; status: string; result?: string; filesModified?: string[] }));
    handlers.set('claimTask', (input) => commTools.claimTask(input as { taskId: string }));

    // Code analysis tools
    handlers.set('getDiagnostics', (input) => codeTools.getDiagnostics(input as { path: string }));
    handlers.set('getSymbolInfo', (input) => codeTools.getSymbolInfo(input as { symbol: string; path: string }));

    return handlers;
  }

  // ─── State & heartbeat ────────────────────────────────────────

  private async writeHeartbeat(
    statusOverride?: 'shutdown' | 'error',
  ): Promise<void> {
    const state: AgentState = {
      agentId: this.agentId,
      role: this.role,
      status: statusOverride ?? (this.currentTaskId ? 'working' : 'idle'),
      currentTaskId: this.currentTaskId,
      completedTaskIds: [...this.completedTaskIds],
      messagesProcessed: this.messagesProcessed,
      lastHeartbeat: new Date().toISOString(),
      startedAt: this.startedAt,
      error: null,
    };

    try {
      await writeAgentState(this.workspaceRoot, state);
    } catch {
      // Best-effort heartbeat
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
