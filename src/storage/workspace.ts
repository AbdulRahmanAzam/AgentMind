import * as path from 'path';
import * as fs from 'fs/promises';
import {
  AgentState,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import { Logger } from '../utils/logger.js';

/**
 * Manages the `.agentmind/` workspace directory tree and
 * agent state files used for heartbeat / crash detection.
 */

// ─── Workspace lifecycle ────────────────────────────────────────

/**
 * Create the full `.agentmind/` directory tree.
 * Idempotent — safe to call multiple times.
 */
export async function initializeWorkspace(
  workspaceRoot: string,
): Promise<void> {
  const dirs = [
    AGENTMIND_CONSTANTS.WORKSPACE_DIR,
    AGENTMIND_CONSTANTS.TASKS_DIR,
    AGENTMIND_CONSTANTS.MAILBOX_DIR,
    AGENTMIND_CONSTANTS.STATE_DIR,
    AGENTMIND_CONSTANTS.LOCKS_DIR,
  ];

  for (const dir of dirs) {
    await fs.mkdir(path.join(workspaceRoot, dir), { recursive: true });
  }

  Logger.info('Workspace initialized: .agentmind/');
}

/**
 * Remove the entire `.agentmind/` directory tree.
 * Call this when the team session ends.
 */
export async function cleanupWorkspace(
  workspaceRoot: string,
): Promise<void> {
  const dir = path.join(workspaceRoot, AGENTMIND_CONSTANTS.WORKSPACE_DIR);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    Logger.info('Workspace cleaned up: .agentmind/');
  } catch {
    Logger.warn('Workspace cleanup: nothing to remove');
  }
}

/** Check whether the `.agentmind/` directory exists. */
export async function workspaceExists(
  workspaceRoot: string,
): Promise<boolean> {
  try {
    await fs.access(
      path.join(workspaceRoot, AGENTMIND_CONSTANTS.WORKSPACE_DIR),
    );
    return true;
  } catch {
    return false;
  }
}

/** Resolve an absolute path inside the `.agentmind/` tree. */
export function getWorkspacePath(
  workspaceRoot: string,
  ...segments: string[]
): string {
  return path.join(
    workspaceRoot,
    AGENTMIND_CONSTANTS.WORKSPACE_DIR,
    ...segments,
  );
}

// ─── Agent state ────────────────────────────────────────────────

/**
 * Write (or overwrite) an agent's state file.
 * Updated on every heartbeat to prove liveness.
 */
export async function writeAgentState(
  workspaceRoot: string,
  state: AgentState,
): Promise<void> {
  const stateDir = path.join(workspaceRoot, AGENTMIND_CONSTANTS.STATE_DIR);
  await fs.mkdir(stateDir, { recursive: true });

  const statePath = path.join(stateDir, `${state.agentId}.json`);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/** Read a single agent's state. Returns `null` if not found. */
export async function readAgentState(
  workspaceRoot: string,
  agentId: string,
): Promise<AgentState | null> {
  const statePath = path.join(
    workspaceRoot,
    AGENTMIND_CONSTANTS.STATE_DIR,
    `${agentId}.json`,
  );
  try {
    const raw = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(raw) as AgentState;
  } catch {
    return null;
  }
}

/** Read all agent state files in the state directory. */
export async function getAllAgentStates(
  workspaceRoot: string,
): Promise<AgentState[]> {
  const stateDir = path.join(workspaceRoot, AGENTMIND_CONSTANTS.STATE_DIR);
  try {
    const files = await fs.readdir(stateDir);
    const states: AgentState[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const raw = await fs.readFile(path.join(stateDir, file), 'utf-8');
      states.push(JSON.parse(raw) as AgentState);
    }

    return states;
  } catch {
    return [];
  }
}

/**
 * Determine whether an agent is still alive based on its
 * heartbeat timestamp. An agent is considered dead if its
 * last heartbeat was more than `thresholdMs` ago.
 *
 * @param workspaceRoot - Absolute path to the project root.
 * @param agentId - The agent to check.
 * @param thresholdMs - Maximum milliseconds since last heartbeat
 *   (defaults to 3× the configured heartbeat interval, i.e. 30 s).
 */
export async function isAgentAlive(
  workspaceRoot: string,
  agentId: string,
  thresholdMs = 30_000,
): Promise<boolean> {
  const state = await readAgentState(workspaceRoot, agentId);
  if (!state) {
    return false;
  }

  if (state.status === 'shutdown') {
    return false;
  }

  const lastBeat = new Date(state.lastHeartbeat).getTime();
  return Date.now() - lastBeat < thresholdMs;
}
