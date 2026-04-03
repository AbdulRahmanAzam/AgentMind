import {
  Task,
  TaskStatus,
  TaskPriority,
  ToolCallResult,
} from '../types.js';
import { TaskList } from '../communication/taskList.js';
import { Mailbox } from '../communication/mailbox.js';
import { Logger } from '../utils/logger.js';

/**
 * Tool handlers for inter-agent communication.
 * Wraps the TaskList and Mailbox classes for use by agent tools.
 */
export class CommunicationToolHandlers {
  protected readonly agentId: string;
  protected readonly taskList: TaskList;
  protected readonly mailbox: Mailbox;

  constructor(agentId: string, taskList: TaskList, mailbox: Mailbox) {
    this.agentId = agentId;
    this.taskList = taskList;
    this.mailbox = mailbox;
  }

  // ─── Messaging ────────────────────────────────────────────────

  async sendMessage(input: {
    to: string;
    content: string;
  }): Promise<ToolCallResult> {
    try {
      const msg = await this.mailbox.sendDirectMessage(
        this.agentId,
        input.to,
        input.content,
      );
      return {
        success: true,
        output: `Message sent to ${input.to} (id: ${msg.id})`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'sendMessage');
    }
  }

  async broadcastMessage(input: {
    content: string;
  }): Promise<ToolCallResult> {
    try {
      const msg = await this.mailbox.sendBroadcast(
        this.agentId,
        input.content,
      );
      return {
        success: true,
        output: `Broadcast sent (id: ${msg.id})`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'broadcastMessage');
    }
  }

  async checkInbox(_input: Record<string, never>): Promise<ToolCallResult> {
    try {
      const messages = await this.mailbox.getUnreadMessages(this.agentId);

      if (messages.length === 0) {
        return {
          success: true,
          output: 'No unread messages.',
          error: null,
          filesModified: [],
        };
      }

      const formatted = messages.map((m) => {
        const time = new Date(m.timestamp).toLocaleTimeString();
        const prefix = m.type === 'broadcast' ? '[BROADCAST]' : '';
        return `[${time}] From ${m.from} ${prefix}: ${m.content}`;
      });

      // Auto-mark as read
      await this.mailbox.markAsRead(
        this.agentId,
        messages.filter((m) => m.type !== 'broadcast').map((m) => m.id),
      );

      return {
        success: true,
        output: `${messages.length} unread message(s):\n\n${formatted.join('\n')}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'checkInbox');
    }
  }

  // ─── Task management ─────────────────────────────────────────

  async getTaskList(_input: Record<string, never>): Promise<ToolCallResult> {
    try {
      const tasks = await this.taskList.getAllTasks();
      const summary = await this.taskList.getTaskSummary();

      if (tasks.length === 0) {
        return {
          success: true,
          output: 'No tasks have been created yet.',
          error: null,
          filesModified: [],
        };
      }

      const summaryLine = Object.entries(summary)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ');

      const header = `Task Summary: ${summaryLine}\n`;
      const divider = '─'.repeat(80) + '\n';
      const tableHeader =
        'ID         | Status      | Assigned To          | Title\n';
      const tableDivider =
        '-----------|-------------|----------------------|---------------------------\n';

      const rows = tasks.map((t) => {
        const id = t.id.padEnd(10);
        const status = t.status.padEnd(11);
        const assigned = (t.assignedTo ?? '(unassigned)').padEnd(20);
        const title = t.title.slice(0, 30);
        const deps =
          t.blockedBy.length > 0
            ? ` [blocked by: ${t.blockedBy.join(', ')}]`
            : '';
        return `${id} | ${status} | ${assigned} | ${title}${deps}`;
      });

      return {
        success: true,
        output: `${header}${divider}${tableHeader}${tableDivider}${rows.join('\n')}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'getTaskList');
    }
  }

  async updateTaskStatus(input: {
    taskId: string;
    status: string;
    result?: string;
    filesModified?: string[];
  }): Promise<ToolCallResult> {
    try {
      const status = input.status as TaskStatus;

      if (status === 'completed' && input.result) {
        const task = await this.taskList.completeTask(
          input.taskId,
          input.result,
          input.filesModified ?? [],
        );
        if (!task) {
          return {
            success: false,
            output: '',
            error: `Task ${input.taskId} not found.`,
            filesModified: [],
          };
        }
        // Unblock dependents
        await this.taskList.unblockDependents(input.taskId);
        return {
          success: true,
          output: `Task ${input.taskId} marked as completed. Result: ${input.result}`,
          error: null,
          filesModified: [],
        };
      }

      if (status === 'failed' && input.result) {
        const task = await this.taskList.failTask(input.taskId, input.result);
        if (!task) {
          return {
            success: false,
            output: '',
            error: `Task ${input.taskId} not found.`,
            filesModified: [],
          };
        }
        return {
          success: true,
          output: `Task ${input.taskId} marked as failed. Error: ${input.result}`,
          error: null,
          filesModified: [],
        };
      }

      const task = await this.taskList.updateTask(input.taskId, {
        status,
        result: input.result ?? undefined,
        filesModified: input.filesModified ?? undefined,
      });

      if (!task) {
        return {
          success: false,
          output: '',
          error: `Task ${input.taskId} not found.`,
          filesModified: [],
        };
      }

      return {
        success: true,
        output: `Task ${input.taskId} updated to "${status}".`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'updateTaskStatus');
    }
  }

  async claimTask(input: { taskId: string }): Promise<ToolCallResult> {
    try {
      const task = await this.taskList.claimTask(
        input.taskId,
        this.agentId,
      );

      if (!task) {
        return {
          success: false,
          output: '',
          error: `Could not claim task ${input.taskId}. It may already be claimed, blocked, or not found.`,
          filesModified: [],
        };
      }

      return {
        success: true,
        output: `Task ${input.taskId} claimed: "${task.title}"`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'claimTask');
    }
  }

  // ─── Helper ───────────────────────────────────────────────────

  protected errorResult(err: unknown, context: string): ToolCallResult {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`CommunicationTools [${this.agentId}]: ${context} — ${message}`);
    return {
      success: false,
      output: '',
      error: message,
      filesModified: [],
    };
  }
}

// ─── Lead-only extensions ───────────────────────────────────────

/**
 * Extended tool handlers available only to the Team Lead.
 * Adds task creation, assignment, and agent shutdown.
 */
export class LeadCommunicationToolHandlers extends CommunicationToolHandlers {
  constructor(taskList: TaskList, mailbox: Mailbox) {
    super('lead', taskList, mailbox);
  }

  async createTask(input: {
    title: string;
    description: string;
    assignedTo?: string;
    priority?: string;
    dependencies?: string[];
  }): Promise<ToolCallResult> {
    try {
      const task = await this.taskList.createTask({
        title: input.title,
        description: input.description,
        assignedTo: input.assignedTo ?? null,
        priority: (input.priority as TaskPriority) ?? 'medium',
        dependencies: input.dependencies ?? [],
        createdBy: this.agentId,
      });

      return {
        success: true,
        output: `Task created: ${task.id} — "${task.title}" [${task.priority}]${task.assignedTo ? ` → ${task.assignedTo}` : ''}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'createTask');
    }
  }

  async assignTask(input: {
    taskId: string;
    agentId: string;
  }): Promise<ToolCallResult> {
    try {
      const task = await this.taskList.updateTask(input.taskId, {
        assignedTo: input.agentId,
      });

      if (!task) {
        return {
          success: false,
          output: '',
          error: `Task ${input.taskId} not found.`,
          filesModified: [],
        };
      }

      // Notify the agent
      await this.mailbox.sendDirectMessage(
        this.agentId,
        input.agentId,
        `You have been assigned task ${input.taskId}: "${task.title}". Please claim and begin work.`,
      );

      return {
        success: true,
        output: `Task ${input.taskId} assigned to ${input.agentId}. Agent notified.`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'assignTask');
    }
  }

  async shutdownAgent(input: {
    agentId: string;
    reason: string;
  }): Promise<ToolCallResult> {
    try {
      await this.mailbox.sendSystemMessage(
        input.agentId,
        `SHUTDOWN requested by lead. Reason: ${input.reason}`,
      );

      Logger.info(
        `Lead requested shutdown of ${input.agentId}: ${input.reason}`,
      );

      return {
        success: true,
        output: `Shutdown request sent to ${input.agentId}. Reason: ${input.reason}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, 'shutdownAgent');
    }
  }
}
