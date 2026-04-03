import * as vscode from 'vscode';
import {
  Task,
  TaskPriority,
  AgentRole,
  ToolCallResult,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import { AgentLLM } from '../llm/modelAccess.js';
import { TaskList } from '../communication/taskList.js';
import { Logger } from '../utils/logger.js';

// ─── Planning types ─────────────────────────────────────────────

/** A task produced by the LLM planner before real Task creation. */
export interface PlannedTask {
  title: string;
  description: string;
  assignedRole: string;
  priority: TaskPriority;
  /** Indices (0-based) into the PlannedTask[] array for dependency ordering. */
  dependencies: number[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

/** Result of the decompose step. */
export interface DecompositionResult {
  tasks: PlannedTask[];
  reasoning: string;
}

// ─── TaskPlanner ────────────────────────────────────────────────

/**
 * Uses the LLM to decompose a user request into discrete
 * `PlannedTask`s. The Team Lead calls `decompose()` in Phase 1,
 * then `createTasksFromPlan()` to persist them in the task list.
 */
export class TaskPlanner {
  private readonly taskList: TaskList;

  constructor(taskList: TaskList) {
    this.taskList = taskList;
  }

  /**
   * Ask the LLM to break a high-level task description into subtasks.
   *
   * @param taskDescription - The user's original request.
   * @param availableRoles - Roles available on the team.
   * @param model - The LLM model to use.
   * @param token - Cancellation token.
   * @returns Decomposition result with planned tasks and reasoning.
   */
  async decompose(
    taskDescription: string,
    availableRoles: AgentRole[],
    model: vscode.LanguageModelChat,
    token: vscode.CancellationToken,
  ): Promise<DecompositionResult> {
    const roleList = availableRoles
      .map((r) => `- ${r.id} (${r.name}): ${r.description}`)
      .join('\n');

    const prompt = `You are a project planning assistant. Break the following task into specific, actionable subtasks that can be executed by a team of specialized AI agents.

## TASK
${taskDescription}

## AVAILABLE ROLES
${roleList}

## INSTRUCTIONS
1. Analyze the task and identify all required work items.
2. Each subtask should be completable by a single agent.
3. Set dependencies where one task must finish before another starts (use 0-based indices into your task array).
4. Assign each task to the most appropriate role.
5. Set priority: "critical" for blocking work, "high" for core features, "medium" for supporting work, "low" for nice-to-haves.
6. Estimate complexity: "low" (< 5 min), "medium" (5-15 min), "high" (> 15 min).

## OUTPUT FORMAT
Respond with ONLY a JSON object (no markdown fences, no extra text):
{
  "reasoning": "Brief explanation of your decomposition strategy",
  "tasks": [
    {
      "title": "Short descriptive title",
      "description": "Detailed description with acceptance criteria",
      "assignedRole": "role-id",
      "priority": "high",
      "dependencies": [],
      "estimatedComplexity": "medium"
    }
  ]
}`;

    const messages = [
      vscode.LanguageModelChatMessage.User(prompt),
    ];

    Logger.info('TaskPlanner: requesting task decomposition from LLM...');

    let responseText = '';
    try {
      const response = await model.sendRequest(messages, {}, token);
      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          responseText += part.value;
        }
      }
    } catch (err) {
      Logger.error(`TaskPlanner: LLM request failed: ${err}`);
      throw new Error(`Task decomposition failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return this.parseDecomposition(responseText, availableRoles);
  }

  /**
   * Convert planned tasks into real persisted Tasks via the TaskList.
   *
   * @param plan - The decomposition result from `decompose()`.
   * @param agentMapping - Map from role-id to agent-id for assignment.
   * @returns Created Task objects.
   */
  async createTasksFromPlan(
    plan: DecompositionResult,
    agentMapping: Map<string, string>,
  ): Promise<Task[]> {
    const createdTasks: Task[] = [];

    for (let i = 0; i < plan.tasks.length; i++) {
      const pt = plan.tasks[i];

      // Resolve dependency indices to actual task IDs
      const depIds = pt.dependencies
        .filter((idx) => idx >= 0 && idx < i && idx < createdTasks.length)
        .map((idx) => createdTasks[idx].id);

      const assignedTo = agentMapping.get(pt.assignedRole) ?? null;

      const task = await this.taskList.createTask({
        title: pt.title,
        description: pt.description,
        assignedTo,
        priority: pt.priority,
        dependencies: depIds,
        createdBy: AGENTMIND_CONSTANTS.LEAD_AGENT_ID,
      });

      createdTasks.push(task);
      Logger.info(
        `TaskPlanner: created ${task.id} — "${task.title}" [${task.priority}]${assignedTo ? ` → ${assignedTo}` : ''}`,
      );
    }

    return createdTasks;
  }

  /**
   * Validate the plan for issues (circular deps, unknown roles).
   */
  validatePlan(
    plan: DecompositionResult,
    availableRoles: AgentRole[],
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const roleIds = new Set(availableRoles.map((r) => r.id));

    for (let i = 0; i < plan.tasks.length; i++) {
      const t = plan.tasks[i];

      if (!t.title || !t.description) {
        issues.push(`Task ${i}: missing title or description`);
      }

      if (!roleIds.has(t.assignedRole)) {
        issues.push(
          `Task ${i} ("${t.title}"): unknown role "${t.assignedRole}"`,
        );
      }

      // Check for forward/self/circular dependencies
      for (const dep of t.dependencies) {
        if (dep >= i) {
          issues.push(
            `Task ${i} ("${t.title}"): depends on task ${dep} which hasn't been created yet (forward or self dependency)`,
          );
        }
        if (dep < 0 || dep >= plan.tasks.length) {
          issues.push(
            `Task ${i} ("${t.title}"): dependency index ${dep} out of range`,
          );
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }

  // ─── Parsing ──────────────────────────────────────────────────

  private parseDecomposition(
    raw: string,
    availableRoles: AgentRole[],
  ): DecompositionResult {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      cleaned = cleaned.slice(firstNewline + 1);
      const lastFence = cleaned.lastIndexOf('```');
      if (lastFence !== -1) {
        cleaned = cleaned.slice(0, lastFence);
      }
    }

    let parsed: { reasoning?: string; tasks?: unknown[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      Logger.error(`TaskPlanner: failed to parse LLM JSON:\n${raw.slice(0, 500)}`);
      throw new Error('Task decomposition returned invalid JSON. Please try again.');
    }

    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      throw new Error('Task decomposition returned no tasks.');
    }

    const roleIds = new Set(availableRoles.map((r) => r.id));
    const validPriorities = new Set<string>(['critical', 'high', 'medium', 'low']);
    const validComplexities = new Set<string>(['low', 'medium', 'high']);

    const tasks: PlannedTask[] = parsed.tasks.map((t: unknown, i: number) => {
      const item = t as Record<string, unknown>;
      return {
        title: String(item.title ?? `Task ${i + 1}`),
        description: String(item.description ?? ''),
        assignedRole: roleIds.has(String(item.assignedRole ?? ''))
          ? String(item.assignedRole)
          : availableRoles[0].id,
        priority: validPriorities.has(String(item.priority ?? ''))
          ? (String(item.priority) as TaskPriority)
          : 'medium',
        dependencies: Array.isArray(item.dependencies)
          ? (item.dependencies as number[]).filter(
              (d) => typeof d === 'number',
            )
          : [],
        estimatedComplexity: validComplexities.has(
          String(item.estimatedComplexity ?? ''),
        )
          ? (String(item.estimatedComplexity) as 'low' | 'medium' | 'high')
          : 'medium',
      };
    });

    return {
      tasks,
      reasoning: String(parsed.reasoning ?? 'No reasoning provided.'),
    };
  }
}
