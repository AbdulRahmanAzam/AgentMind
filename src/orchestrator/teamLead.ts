import * as vscode from 'vscode';
import {
  TeamConfig,
  TeamPhaseStatus,
  LeadPhase,
  ToolCallResult,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import { AgentLLM } from '../llm/modelAccess.js';
import { buildLeadSystemPrompt } from '../llm/agentPrompts.js';
import { getToolsForRole } from '../llm/toolDefinitions.js';
import { TaskPlanner, DecompositionResult } from './taskPlanner.js';
import { AgentManager } from './agentManager.js';
import { TaskList } from '../communication/taskList.js';
import { Mailbox } from '../communication/mailbox.js';
import { LeadCommunicationToolHandlers } from '../tools/communicationTools.js';
import { FileToolHandlers } from '../tools/fileTools.js';
import { TerminalToolHandlers } from '../tools/terminalTools.js';
import { CodeToolHandlers } from '../tools/codeTools.js';
import {
  createAgentTerminal,
  AgentPseudoterminal,
} from '../terminal/agentTerminal.js';
import { readAgentmindMd } from '../storage/agentmindMd.js';
import { Logger } from '../utils/logger.js';

/** Max verification → debug iterations before giving up. */
const MAX_VERIFY_ITERATIONS = 3;

/** Polling interval for the monitoring loop (ms). */
const MONITOR_INTERVAL_MS = 5000;

/**
 * The Team Lead orchestrates the full 5-phase lifecycle:
 *
 * 1. **Planning** — decompose the user request into tasks
 * 2. **Assigning** — create tasks and notify agents
 * 3. **Monitoring** — poll progress, handle messages, detect issues
 * 4. **Verification** — run tests / tsc, create fix tasks if needed
 * 5. **Completion** — summary broadcast and shutdown
 */
export class TeamLead {
  private readonly teamConfig: TeamConfig;
  private readonly agentManager: AgentManager;
  private readonly taskList: TaskList;
  private readonly mailbox: Mailbox;
  private readonly workspaceRoot: string;
  private readonly taskPlanner: TaskPlanner;

  private llm: AgentLLM | null = null;
  private model: vscode.LanguageModelChat | null = null;
  private pty: AgentPseudoterminal | null = null;
  private terminal: vscode.Terminal | null = null;

  private phase: LeadPhase = 'planning';
  private phaseStatus: TeamPhaseStatus = {
    planning: false,
    execution: false,
    testing: false,
    debugging: false,
    completion: false,
  };

  private toolHandlers: Map<string, (input: unknown) => Promise<ToolCallResult>> | null = null;

  constructor(
    teamConfig: TeamConfig,
    agentManager: AgentManager,
    taskList: TaskList,
    mailbox: Mailbox,
    workspaceRoot: string,
  ) {
    this.teamConfig = teamConfig;
    this.agentManager = agentManager;
    this.taskList = taskList;
    this.mailbox = mailbox;
    this.workspaceRoot = workspaceRoot;
    this.taskPlanner = new TaskPlanner(taskList);
  }

  /**
   * Initialize the Team Lead: set up LLM, PTY, tool handlers.
   */
  async initialize(model: vscode.LanguageModelChat): Promise<void> {
    this.model = model;

    // Create lead's own pseudoterminal
    const { terminal, pty } = createAgentTerminal(
      AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
      'Team Lead',
      '👔',
    );
    this.pty = pty;
    this.terminal = terminal;
    terminal.show(true);

    // Build LLM with lead-specific prompt
    const agentRoles = this.teamConfig.agents.map((a) => ({
      id: a.agentId,
      name: a.role.name,
    }));

    const systemPrompt = buildLeadSystemPrompt(
      this.teamConfig.taskDescription,
      agentRoles,
    );

    const tools = getToolsForRole('lead', true);
    this.llm = new AgentLLM(
      AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
      systemPrompt,
      tools,
    );
    this.llm.setModel(model);

    // Inject handbook context
    try {
      const handbook = await readAgentmindMd(this.workspaceRoot);
      if (handbook) {
        this.llm.addSystemContext(`\n## Project Handbook\n${handbook}`);
      }
    } catch {
      // OK
    }

    // Register lead's tool handlers
    this.toolHandlers = this.registerLeadToolHandlers();

    this.pty.writeSuccess('Team Lead initialized.');
  }

  /**
   * Execute the full 5-phase lifecycle.
   */
  async execute(token: vscode.CancellationToken): Promise<void> {
    if (!this.llm || !this.pty || !this.toolHandlers) {
      throw new Error('TeamLead not initialized — call initialize() first.');
    }

    try {
      // Phase 1: Planning
      this.phase = 'planning';
      this.pty.writeInfo('═══ Phase 1: Planning ═══');
      await this.planPhase(token);
      this.phaseStatus.planning = true;

      if (token.isCancellationRequested) { return; }

      // Phase 2: Assigning (handled within planPhase via createTasksFromPlan)
      this.phase = 'assigning';
      this.pty.writeInfo('═══ Phase 2: Assigning tasks ═══');
      await this.assignPhase(token);

      if (token.isCancellationRequested) { return; }

      // Phase 3: Monitoring
      this.phase = 'monitoring';
      this.pty.writeInfo('═══ Phase 3: Monitoring execution ═══');
      await this.monitorPhase(token);
      this.phaseStatus.execution = true;

      if (token.isCancellationRequested) { return; }

      // Phase 4: Verification → Debug loop
      for (let iter = 0; iter < MAX_VERIFY_ITERATIONS; iter++) {
        this.phase = 'verifying';
        this.pty.writeInfo(`═══ Phase 4: Verification (attempt ${iter + 1}/${MAX_VERIFY_ITERATIONS}) ═══`);
        const passed = await this.verifyPhase(token);

        if (token.isCancellationRequested) { return; }

        if (passed) {
          this.phaseStatus.testing = true;
          break;
        }

        // Debug phase: create fix tasks and re-monitor
        this.phase = 'debugging';
        this.pty.writeInfo('═══ Phase 4b: Debugging failures ═══');
        await this.debugPhase(token);
        this.phaseStatus.debugging = true;

        if (token.isCancellationRequested) { return; }

        // Re-monitor until fixes complete
        this.phase = 'monitoring';
        await this.monitorPhase(token);
      }

      // Phase 5: Completion
      this.phase = 'completing';
      this.pty.writeInfo('═══ Phase 5: Completion ═══');
      await this.completePhase(token);
      this.phaseStatus.completion = true;

      this.pty.writeSuccess('All phases complete. Mission accomplished!');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(`TeamLead execution error: ${message}`);
      this.pty.writeError(`Execution error: ${message}`);
    }
  }

  /** Get current phase for status reporting. */
  getPhase(): LeadPhase {
    return this.phase;
  }

  /** Get phase completion status. */
  getPhaseStatus(): TeamPhaseStatus {
    return { ...this.phaseStatus };
  }

  /** Clean up resources. */
  dispose(): void {
    try {
      this.terminal?.dispose();
    } catch {
      // May already be disposed
    }
  }

  // ─── Phase implementations ────────────────────────────────────

  private async planPhase(token: vscode.CancellationToken): Promise<void> {
    if (!this.model || !this.pty) { return; }

    const availableRoles = this.teamConfig.agents.map((a) => a.role);

    this.pty.writeThinking('Analyzing task and creating plan...');

    const plan = await this.taskPlanner.decompose(
      this.teamConfig.taskDescription,
      availableRoles,
      this.model,
      token,
    );

    // Validate
    const validation = this.taskPlanner.validatePlan(plan, availableRoles);
    if (!validation.valid) {
      this.pty.writeError(
        `Plan validation issues:\n${validation.issues.join('\n')}`,
      );
      // Proceed anyway — the planner auto-corrects unknown roles
    }

    this.pty.writeInfo(
      `Plan created: ${plan.tasks.length} tasks. Reasoning: ${plan.reasoning}`,
    );

    // Create tasks from plan
    const agentMapping = new Map<string, string>();
    for (const ac of this.teamConfig.agents) {
      agentMapping.set(ac.role.id, ac.agentId);
    }

    await this.taskPlanner.createTasksFromPlan(plan, agentMapping);
    this.pty.writeSuccess(`${plan.tasks.length} tasks created and assigned.`);
  }

  private async assignPhase(token: vscode.CancellationToken): Promise<void> {
    if (!this.pty) { return; }

    // Notify each agent about their tasks
    for (const ac of this.teamConfig.agents) {
      const tasks = await this.taskList.getTasksByAgent(ac.agentId);
      if (tasks.length > 0) {
        const taskSummary = tasks
          .map((t) => `  - ${t.id}: ${t.title} [${t.priority}]`)
          .join('\n');

        await this.mailbox.sendDirectMessage(
          AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
          ac.agentId,
          `You have been assigned ${tasks.length} task(s):\n${taskSummary}\n\nPlease claim and begin working on them in priority order.`,
        );

        this.pty.writeTaskUpdate(
          ac.agentId,
          `Notified about ${tasks.length} task(s)`,
        );
      }
    }

    // Broadcast team-wide kickoff
    await this.mailbox.sendBroadcast(
      AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
      'All tasks have been assigned. Team execution is starting! Check your inbox for your task assignments.',
    );

    this.pty.writeSuccess('All agents notified. Execution starting.');
  }

  private async monitorPhase(token: vscode.CancellationToken): Promise<void> {
    if (!this.pty || !this.llm || !this.toolHandlers) { return; }

    this.pty.writeInfo('Monitoring agent progress...');

    let stableCount = 0;
    const STABLE_THRESHOLD = 3; // consecutive checks with all tasks done

    while (!token.isCancellationRequested) {
      const summary = await this.taskList.getTaskSummary();
      const totalTasks =
        summary.pending +
        summary.claimed +
        summary['in-progress'] +
        summary.blocked +
        summary.completed +
        summary.failed;

      const activeTasks =
        summary.pending + summary.claimed + summary['in-progress'] + summary.blocked;

      this.pty.writeProgress(
        summary.completed,
        totalTasks,
        `Tasks: ${summary.completed}/${totalTasks} done, ${activeTasks} active, ${summary.failed} failed`,
      );

      // All tasks completed or failed
      if (activeTasks === 0 && totalTasks > 0) {
        stableCount++;
        if (stableCount >= STABLE_THRESHOLD) {
          this.pty.writeSuccess('All tasks completed or resolved.');
          break;
        }
      } else {
        stableCount = 0;
      }

      // Check for stalled agents
      const stalled = await this.agentManager.monitorHealth();
      if (stalled.length > 0) {
        this.pty.writeError(`Stalled agents detected: ${stalled.join(', ')}`);
      }

      // Check lead's inbox for agent messages
      const messages = await this.mailbox.getUnreadMessages(
        AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
      );
      if (messages.length > 0) {
        for (const msg of messages) {
          this.pty.writeMessage(msg.from, msg.content);
        }

        await this.mailbox.markAsRead(
          AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
          messages.map((m) => m.id),
        );

        // Let the LLM process messages and respond
        const msgSummary = messages
          .map((m) => `[${m.from}]: ${m.content}`)
          .join('\n');

        await this.llm.runAgentLoop(
          `Process these messages from your team and take action:\n\n${msgSummary}`,
          this.toolHandlers,
          token,
          (text) => this.pty!.writeThinking(text),
          (toolName, input) =>
            this.pty!.writeToolCall(toolName, JSON.stringify(input).slice(0, 100)),
        );
      }

      // Wait before next check
      await this.delay(MONITOR_INTERVAL_MS);
    }
  }

  private async verifyPhase(
    token: vscode.CancellationToken,
  ): Promise<boolean> {
    if (!this.pty || !this.llm || !this.toolHandlers) { return true; }

    this.pty.writeThinking('Running verification checks...');

    // Use the LLM to run verification via its tools
    const verifyResult = await this.llm.runAgentLoop(
      `All implementation tasks are complete. Now run verification:

1. Run the TypeScript compiler: \`npx tsc --noEmit\` (or equivalent build command)
2. Run the test suite if one exists: \`npm test\` (handle gracefully if no tests)
3. Check for any lint errors: \`npm run lint\` (handle gracefully if not configured)

Report the results. If ALL checks pass, say "VERIFICATION PASSED".
If any check fails, list the specific failures.`,
      this.toolHandlers,
      token,
      (text) => this.pty!.writeThinking(text),
      (toolName, input) =>
        this.pty!.writeToolCall(toolName, JSON.stringify(input).slice(0, 100)),
    );

    const passed = verifyResult.toUpperCase().includes('VERIFICATION PASSED');

    if (passed) {
      this.pty.writeSuccess('Verification passed!');
    } else {
      this.pty.writeError('Verification found issues.');
    }

    return passed;
  }

  private async debugPhase(token: vscode.CancellationToken): Promise<void> {
    if (!this.pty || !this.llm || !this.toolHandlers) { return; }

    this.pty.writeThinking('Analyzing failures and creating fix tasks...');

    // Let the LLM create fix tasks based on verification failures
    await this.llm.runAgentLoop(
      `Verification failed. Analyze the errors from the previous verification step and:

1. For each error, determine which file and which agent's work caused it.
2. Create fix tasks using \`createTask\` with detailed descriptions of what needs to be fixed.
3. Assign fix tasks to the agent that originally wrote the code (check the task list for filesModified).
4. Set priority to "critical" for fix tasks.
5. Send messages to assigned agents explaining what needs to be fixed.

Create specific, actionable fix tasks. Do NOT try to fix the code yourself.`,
      this.toolHandlers,
      token,
      (text) => this.pty!.writeThinking(text),
      (toolName, input) =>
        this.pty!.writeToolCall(toolName, JSON.stringify(input).slice(0, 100)),
    );

    this.pty.writeInfo('Fix tasks created. Re-entering monitoring phase.');
  }

  private async completePhase(token: vscode.CancellationToken): Promise<void> {
    if (!this.pty || !this.llm || !this.toolHandlers) { return; }

    // Generate final summary via LLM
    const summaryResult = await this.llm.runAgentLoop(
      `The project is complete! All tasks passed verification. Generate a final summary:

1. Use \`getTaskList\` to review all completed tasks.
2. Summarize what was accomplished.
3. List all files that were created or modified.
4. Note any known limitations or recommended follow-up items.
5. Send a broadcast to the team thanking them and announcing completion.

Then say "MISSION COMPLETE" at the end.`,
      this.toolHandlers,
      token,
      (text) => this.pty!.writeThinking(text),
      (toolName, input) =>
        this.pty!.writeToolCall(toolName, JSON.stringify(input).slice(0, 100)),
    );

    this.pty.writeSuccess('Mission complete. Shutting down team...');

    // Shutdown all agents
    await this.agentManager.shutdownAll('Mission complete');
  }

  // ─── Tool registration ────────────────────────────────────────

  private registerLeadToolHandlers(): Map<string, (input: unknown) => Promise<ToolCallResult>> {
    const handlers = new Map<string, (input: unknown) => Promise<ToolCallResult>>();
    const fileTools = new FileToolHandlers(this.workspaceRoot);
    const terminalTools = new TerminalToolHandlers(this.workspaceRoot);
    const leadCommTools = new LeadCommunicationToolHandlers(
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

    // Lead communication tools (superset of teammate tools)
    handlers.set('sendMessage', (input) => leadCommTools.sendMessage(input as { to: string; content: string }));
    handlers.set('broadcastMessage', (input) => leadCommTools.broadcastMessage(input as { content: string }));
    handlers.set('checkInbox', (input) => leadCommTools.checkInbox(input as Record<string, never>));
    handlers.set('getTaskList', (input) => leadCommTools.getTaskList(input as Record<string, never>));
    handlers.set('updateTaskStatus', (input) => leadCommTools.updateTaskStatus(input as { taskId: string; status: string; result?: string; filesModified?: string[] }));
    handlers.set('claimTask', (input) => leadCommTools.claimTask(input as { taskId: string }));

    // Lead-only tools
    handlers.set('createTask', (input) => leadCommTools.createTask(input as { title: string; description: string; assignedTo?: string; priority?: string; dependencies?: string[] }));
    handlers.set('assignTask', (input) => leadCommTools.assignTask(input as { taskId: string; agentId: string }));
    handlers.set('shutdownAgent', (input) => leadCommTools.shutdownAgent(input as { agentId: string; reason: string }));

    // Code analysis tools
    handlers.set('getDiagnostics', (input) => codeTools.getDiagnostics(input as { path: string }));
    handlers.set('getSymbolInfo', (input) => codeTools.getSymbolInfo(input as { symbol: string; path: string }));

    return handlers;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
