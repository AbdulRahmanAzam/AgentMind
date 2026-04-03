/**
 * AgentMind Core Type System
 *
 * This file is the single source of truth for all interfaces, types,
 * and constants used across the AgentMind extension. Every module
 * imports its type definitions from here.
 */

// ─── Task Types ────────────────────────────────────────────────────

/** Status of a task in the shared task list. */
export type TaskStatus =
  | 'pending'
  | 'claimed'
  | 'in-progress'
  | 'blocked'
  | 'completed'
  | 'failed';

/** Priority level for task ordering. */
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * A unit of work in the shared task list.
 * Stored as an individual JSON file in `.agentmind/tasks/`.
 */
export interface Task {
  /** Unique identifier, e.g. `task-001`. */
  id: string;
  /** Short human-readable title. */
  title: string;
  /** Detailed requirements the assigned agent should follow. */
  description: string;
  /** Agent ID this task is assigned to, or `null` if unassigned. */
  assignedTo: string | null;
  /** Current lifecycle status. */
  status: TaskStatus;
  /** Task IDs that must complete before this task can start. */
  dependencies: string[];
  /** Computed subset of `dependencies` that are not yet completed. */
  blockedBy: string[];
  /** Scheduling priority. */
  priority: TaskPriority;
  /** ID of the agent that created this task (`'lead'` or an agent ID). */
  createdBy: string;
  /** Agent ID that has claimed this task, or `null`. */
  claimedBy: string | null;
  /** Summary of completed work, or `null` if not yet done. */
  result: string | null;
  /** Workspace-relative paths of files touched while working on this task. */
  filesModified: string[];
  /** ISO 8601 timestamp of creation. */
  createdAt: string;
  /** ISO 8601 timestamp when work started, or `null`. */
  startedAt: string | null;
  /** ISO 8601 timestamp when work completed, or `null`. */
  completedAt: string | null;
}

// ─── Agent Types ───────────────────────────────────────────────────

/**
 * Defines a specialized agent role with its own system prompt,
 * expertise areas, and tool access.
 */
export interface AgentRole {
  /** Unique role identifier, e.g. `'backend-dev'`. */
  id: string;
  /** Human-readable name, e.g. `'Backend Developer'`. */
  name: string;
  /** Brief description of this role's responsibilities. */
  description: string;
  /** Full system prompt injected at the start of the agent's context. */
  systemPrompt: string;
  /** Keywords used for matching tasks to this role's expertise. */
  expertise: string[];
  /** Tool IDs this role is permitted to use. `['*']` means all tools. */
  allowedTools: string[];
  /** Emoji icon displayed in terminals and logs. */
  icon: string;
}

/** Runtime status of an individual agent. */
export type AgentStatus =
  | 'initializing'
  | 'idle'
  | 'working'
  | 'waiting'
  | 'paused'
  | 'error'
  | 'shutdown';

/**
 * Persisted state of an agent, written to `.agentmind/state/{agentId}.json`.
 * Used for heartbeat monitoring and crash detection.
 */
export interface AgentState {
  /** Unique agent identifier. */
  agentId: string;
  /** The role this agent is fulfilling. */
  role: AgentRole;
  /** Current runtime status. */
  status: AgentStatus;
  /** ID of the task currently being worked on, or `null`. */
  currentTaskId: string | null;
  /** IDs of all tasks this agent has completed. */
  completedTaskIds: string[];
  /** Count of mailbox messages this agent has processed. */
  messagesProcessed: number;
  /** ISO 8601 timestamp of the last heartbeat write. */
  lastHeartbeat: string;
  /** ISO 8601 timestamp when this agent was spawned. */
  startedAt: string;
  /** Error message if agent is in `'error'` status, otherwise `null`. */
  error: string | null;
}

// ─── Messaging Types ───────────────────────────────────────────────

/** Classification of a message in the mailbox system. */
export type MessageType = 'direct' | 'broadcast' | 'system';

/**
 * A message exchanged between agents via the mailbox system.
 * Stored as JSONL entries in `.agentmind/mailbox/`.
 */
export interface AgentMessage {
  /** Unique message identifier. */
  id: string;
  /** Sender agent ID, `'lead'`, or `'system'`. */
  from: string;
  /** Recipient agent ID or `'all'` for broadcasts. */
  to: string;
  /** Message body. */
  content: string;
  /** Message classification. */
  type: MessageType;
  /** ISO 8601 timestamp of when the message was sent. */
  timestamp: string;
  /** Whether the recipient has read this message. */
  read: boolean;
  /** ID of the message this is replying to, or `null`. */
  replyTo: string | null;
}

// ─── Team Types ────────────────────────────────────────────────────

/** Overall status of the team lifecycle. */
export type TeamStatus =
  | 'configuring'
  | 'planning'
  | 'executing'
  | 'testing'
  | 'debugging'
  | 'completed'
  | 'failed'
  | 'stopped';

/**
 * Configuration for the entire agent team, persisted for the
 * duration of a session.
 */
export interface TeamConfig {
  /** Unique team identifier. */
  teamId: string;
  /** The original user request that spawned this team. */
  taskDescription: string;
  /** Configuration for each teammate agent. */
  agents: TeamAgentConfig[];
  /** ISO 8601 timestamp of team creation. */
  createdAt: string;
  /** Current lifecycle phase of the team. */
  status: TeamStatus;
}

/** Per-agent entry within a TeamConfig. */
export interface TeamAgentConfig {
  /** Unique agent identifier. */
  agentId: string;
  /** The role assigned to this agent. */
  role: AgentRole;
  /** `true` if the user explicitly chose this role, `false` if auto-assigned by lead. */
  assignedByUser: boolean;
}

// ─── Lead Orchestration Types ──────────────────────────────────────

/** Which phase the Team Lead is currently in. */
export type LeadPhase =
  | 'onboarding'
  | 'planning'
  | 'assigning'
  | 'monitoring'
  | 'verifying'
  | 'debugging'
  | 'completing';

/**
 * Tracks which high-level phases have been completed.
 * The lead only stops when all phases are `true`.
 */
export interface TeamPhaseStatus {
  /** Task decomposition and planning complete. */
  planning: boolean;
  /** All tasks executed by agents. */
  execution: boolean;
  /** Verification (tests, type checks) passed. */
  testing: boolean;
  /** Fix tasks for failures resolved. */
  debugging: boolean;
  /** Final summary delivered to user. */
  completion: boolean;
}

// ─── Tool Types ────────────────────────────────────────────────────

/** Result returned by every agent tool handler. */
export interface ToolCallResult {
  /** Whether the tool invocation succeeded. */
  success: boolean;
  /** Human-readable output (stdout, file contents, etc.). */
  output: string;
  /** Error message on failure, or `null`. */
  error: string | null;
  /** Workspace-relative paths of files modified by this call. */
  filesModified: string[];
}

/**
 * Definition of a tool that agents can invoke.
 * Registered with the LLM via `vscode.LanguageModelChatTool`.
 */
export interface AgentToolDefinition {
  /** Tool name shown to the LLM. */
  name: string;
  /** Description of what this tool does, used by the LLM to decide when to call it. */
  description: string;
  /** JSON Schema describing the expected input parameters. */
  inputSchema: Record<string, unknown>;
  /** Async handler that executes the tool and returns a result. */
  handler: (input: Record<string, unknown>) => Promise<ToolCallResult>;
}

// ─── Constants ─────────────────────────────────────────────────────

/**
 * Central constants used across the extension.
 * All filesystem paths are relative to the workspace root.
 */
export const AGENTMIND_CONSTANTS = {
  /** Root directory for all AgentMind runtime data. */
  WORKSPACE_DIR: '.agentmind',
  /** Directory containing individual task JSON files. */
  TASKS_DIR: '.agentmind/tasks',
  /** Directory containing agent inbox JSONL files. */
  MAILBOX_DIR: '.agentmind/mailbox',
  /** Directory containing agent state/heartbeat JSON files. */
  STATE_DIR: '.agentmind/state',
  /** Directory containing advisory lock files. */
  LOCKS_DIR: '.agentmind/locks',
  /** Path to the auto-generated agent handbook. */
  HANDBOOK_FILE: '.agentmind/AGENTMIND.md',
  /** Path to the broadcast message log. */
  BROADCAST_FILE: '.agentmind/mailbox/broadcast.jsonl',
  /** Reserved agent ID for the Team Lead. */
  LEAD_AGENT_ID: 'lead',
  /** Maximum number of messages to keep in an agent's LLM context. */
  MAX_CONTEXT_MESSAGES: 50,
  /** Milliseconds to wait for a file lock before giving up. */
  LOCK_TIMEOUT_MS: 5000,
  /** Milliseconds between lock acquisition retries. */
  LOCK_RETRY_MS: 100,
} as const;
