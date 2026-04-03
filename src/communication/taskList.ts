import * as path from 'path';
import * as fs from 'fs/promises';
import {
  Task,
  TaskStatus,
  TaskPriority,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import { LockManager } from './lockManager.js';
import { Logger } from '../utils/logger.js';
import { generateTaskId } from '../utils/ids.js';

/** Options for creating a new task. */
export interface CreateTaskOptions {
  title: string;
  description: string;
  assignedTo?: string | null;
  dependencies?: string[];
  priority?: TaskPriority;
  createdBy: string;
}

/**
 * Manages the shared task list stored as individual JSON files
 * in `.agentmind/tasks/`. All writes go through `LockManager`
 * to guarantee safe concurrent access from multiple agents.
 */
export class TaskList {
  private readonly workspaceRoot: string;
  private readonly tasksDir: string;
  private readonly lockManager: LockManager;

  constructor(workspaceRoot: string, lockManager: LockManager) {
    this.workspaceRoot = workspaceRoot;
    this.tasksDir = path.join(
      workspaceRoot,
      AGENTMIND_CONSTANTS.TASKS_DIR,
    );
    this.lockManager = lockManager;
  }

  // ─── CRUD ──────────────────────────────────────────────────────

  /** Create a new task and persist it to disk. Returns the created Task. */
  async createTask(options: CreateTaskOptions): Promise<Task> {
    await fs.mkdir(this.tasksDir, { recursive: true });

    const counter = await this.getNextTaskCounter();
    const taskId = generateTaskId(counter);
    const taskPath = this.taskPath(taskId);

    const task: Task = {
      id: taskId,
      title: options.title,
      description: options.description,
      assignedTo: options.assignedTo ?? null,
      status: 'pending',
      dependencies: options.dependencies ?? [],
      blockedBy: [],
      priority: options.priority ?? 'medium',
      createdBy: options.createdBy,
      claimedBy: null,
      result: null,
      filesModified: [],
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    // Compute initial blockedBy
    task.blockedBy = await this.computeBlockedBy(task.dependencies);

    if (task.blockedBy.length > 0) {
      task.status = 'blocked';
    }

    await this.lockManager.withLock(taskPath, async () => {
      await fs.writeFile(taskPath, JSON.stringify(task, null, 2), 'utf-8');
    });

    Logger.info(`Task created: ${taskId} — "${options.title}"`);
    return task;
  }

  /** Read a single task by ID. Returns `null` if not found. */
  async getTask(taskId: string): Promise<Task | null> {
    const taskPath = this.taskPath(taskId);
    try {
      const raw = await fs.readFile(taskPath, 'utf-8');
      return JSON.parse(raw) as Task;
    } catch {
      return null;
    }
  }

  /** Read every task in the tasks directory. */
  async getAllTasks(): Promise<Task[]> {
    try {
      const files = await fs.readdir(this.tasksDir);
      const tasks: Task[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }
        const raw = await fs.readFile(
          path.join(this.tasksDir, file),
          'utf-8',
        );
        tasks.push(JSON.parse(raw) as Task);
      }

      return tasks.sort((a, b) => {
        const priorityOrder: Record<TaskPriority, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    } catch {
      return [];
    }
  }

  /** Partial-update a task (merges fields). */
  async updateTask(
    taskId: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt' | 'createdBy'>>,
  ): Promise<Task | null> {
    const taskPath = this.taskPath(taskId);

    return this.lockManager.withLock(taskPath, async () => {
      const task = await this.getTask(taskId);
      if (!task) {
        Logger.warn(`updateTask: task ${taskId} not found`);
        return null;
      }

      const updated: Task = { ...task, ...updates };
      await fs.writeFile(
        taskPath,
        JSON.stringify(updated, null, 2),
        'utf-8',
      );

      Logger.debug(`Task updated: ${taskId}`);
      return updated;
    });
  }

  // ─── Lifecycle transitions ────────────────────────────────────

  /**
   * Claim an available task for the given agent.
   * The task must be `pending` (not blocked) and unassigned or
   * assigned to this agent.
   */
  async claimTask(taskId: string, agentId: string): Promise<Task | null> {
    const taskPath = this.taskPath(taskId);

    return this.lockManager.withLock(taskPath, async () => {
      const task = await this.getTask(taskId);
      if (!task) {
        return null;
      }

      if (task.status !== 'pending') {
        Logger.warn(
          `claimTask: ${taskId} is "${task.status}", not "pending"`,
        );
        return null;
      }

      if (task.assignedTo && task.assignedTo !== agentId) {
        Logger.warn(
          `claimTask: ${taskId} is assigned to ${task.assignedTo}, not ${agentId}`,
        );
        return null;
      }

      task.status = 'in-progress';
      task.claimedBy = agentId;
      task.assignedTo = agentId;
      task.startedAt = new Date().toISOString();

      await fs.writeFile(
        taskPath,
        JSON.stringify(task, null, 2),
        'utf-8',
      );

      Logger.info(`Task claimed: ${taskId} → ${agentId}`);
      return task;
    });
  }

  /**
   * Mark a task as completed with a result summary and list of
   * modified files. May unblock downstream dependents.
   */
  async completeTask(
    taskId: string,
    result: string,
    filesModified: string[] = [],
  ): Promise<Task | null> {
    const taskPath = this.taskPath(taskId);

    return this.lockManager.withLock(taskPath, async () => {
      const task = await this.getTask(taskId);
      if (!task) {
        return null;
      }

      task.status = 'completed';
      task.result = result;
      task.filesModified = filesModified;
      task.completedAt = new Date().toISOString();

      await fs.writeFile(
        taskPath,
        JSON.stringify(task, null, 2),
        'utf-8',
      );

      Logger.info(`Task completed: ${taskId}`);
      return task;
    });
  }

  /** Mark a task as failed with an error message. */
  async failTask(taskId: string, error: string): Promise<Task | null> {
    const taskPath = this.taskPath(taskId);

    return this.lockManager.withLock(taskPath, async () => {
      const task = await this.getTask(taskId);
      if (!task) {
        return null;
      }

      task.status = 'failed';
      task.result = error;
      task.completedAt = new Date().toISOString();

      await fs.writeFile(
        taskPath,
        JSON.stringify(task, null, 2),
        'utf-8',
      );

      Logger.warn(`Task failed: ${taskId} — ${error}`);
      return task;
    });
  }

  // ─── Queries ──────────────────────────────────────────────────

  /**
   * Tasks that an agent can pick up right now:
   * status `pending`, no unresolved blockers, and either unassigned
   * or assigned to the requesting agent.
   */
  async getAvailableTasks(agentId?: string): Promise<Task[]> {
    const all = await this.getAllTasks();
    return all.filter((t) => {
      if (t.status !== 'pending') {
        return false;
      }
      if (t.blockedBy.length > 0) {
        return false;
      }
      if (agentId && t.assignedTo && t.assignedTo !== agentId) {
        return false;
      }
      return true;
    });
  }

  /** All tasks assigned to or claimed by a specific agent. */
  async getTasksByAgent(agentId: string): Promise<Task[]> {
    const all = await this.getAllTasks();
    return all.filter(
      (t) => t.assignedTo === agentId || t.claimedBy === agentId,
    );
  }

  /** Summary object suitable for status reports. */
  async getTaskSummary(): Promise<Record<TaskStatus, number>> {
    const all = await this.getAllTasks();
    const summary: Record<TaskStatus, number> = {
      pending: 0,
      claimed: 0,
      'in-progress': 0,
      blocked: 0,
      completed: 0,
      failed: 0,
    };
    for (const t of all) {
      summary[t.status]++;
    }
    return summary;
  }

  /**
   * Recompute blockedBy for every task and transition newly
   * unblocked tasks from `blocked` → `pending`.
   * Call this after a task completes.
   */
  async unblockDependents(completedTaskId: string): Promise<string[]> {
    const all = await this.getAllTasks();
    const unblocked: string[] = [];

    for (const task of all) {
      if (!task.dependencies.includes(completedTaskId)) {
        continue;
      }

      const newBlockedBy = await this.computeBlockedBy(task.dependencies);

      if (
        task.status === 'blocked' &&
        newBlockedBy.length === 0
      ) {
        await this.updateTask(task.id, {
          status: 'pending',
          blockedBy: [],
        });
        unblocked.push(task.id);
        Logger.info(`Task unblocked: ${task.id}`);
      } else if (
        newBlockedBy.length !== task.blockedBy.length ||
        !newBlockedBy.every((id) => task.blockedBy.includes(id))
      ) {
        await this.updateTask(task.id, { blockedBy: newBlockedBy });
      }
    }

    return unblocked;
  }

  // ─── Internals ────────────────────────────────────────────────

  /** Absolute path to a task's JSON file. */
  private taskPath(taskId: string): string {
    return path.join(this.tasksDir, `${taskId}.json`);
  }

  /**
   * Determine which of the given dependency IDs are not yet completed.
   */
  private async computeBlockedBy(
    dependencies: string[],
  ): Promise<string[]> {
    if (dependencies.length === 0) {
      return [];
    }

    const blocked: string[] = [];
    for (const depId of dependencies) {
      const dep = await this.getTask(depId);
      if (!dep || dep.status !== 'completed') {
        blocked.push(depId);
      }
    }
    return blocked;
  }

  /**
   * Scan the tasks directory to determine the next counter value.
   * Task files are named `task-001.json`, `task-002.json`, etc.
   */
  private async getNextTaskCounter(): Promise<number> {
    try {
      const files = await fs.readdir(this.tasksDir);
      let max = 0;
      for (const file of files) {
        const match = file.match(/^task-(\d+)\.json$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > max) {
            max = num;
          }
        }
      }
      return max + 1;
    } catch {
      return 1;
    }
  }
}
