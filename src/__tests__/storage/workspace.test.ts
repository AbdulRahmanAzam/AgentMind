import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeWorkspace,
  cleanupWorkspace,
  workspaceExists,
  writeAgentState,
  readAgentState,
  getAllAgentStates,
  isAgentAlive,
} from '../../storage/workspace.js';
import { AgentState } from '../../types.js';
import { createTempWorkspace, cleanTempWorkspace } from '../setup.js';

describe('Workspace Storage', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempWorkspace();
  });

  afterEach(async () => {
    await cleanTempWorkspace(tmpDir);
  });

  // ─── initializeWorkspace ─────────────────────────────────────

  it('initializeWorkspace — creates .agentmind directory tree', async () => {
    // createTempWorkspace already calls initializeWorkspace-like logic
    // but let's test the function directly on a fresh root
    await cleanupWorkspace(tmpDir);
    expect(await workspaceExists(tmpDir)).toBe(false);

    await initializeWorkspace(tmpDir);
    expect(await workspaceExists(tmpDir)).toBe(true);
  });

  it('initializeWorkspace — idempotent (safe to call twice)', async () => {
    await initializeWorkspace(tmpDir);
    await initializeWorkspace(tmpDir);
    expect(await workspaceExists(tmpDir)).toBe(true);
  });

  // ─── cleanupWorkspace ────────────────────────────────────────

  it('cleanupWorkspace — removes .agentmind directory', async () => {
    await initializeWorkspace(tmpDir);
    expect(await workspaceExists(tmpDir)).toBe(true);

    await cleanupWorkspace(tmpDir);
    expect(await workspaceExists(tmpDir)).toBe(false);
  });

  // ─── Agent state round-trip ──────────────────────────────────

  it('writeAgentState + readAgentState — round-trip works', async () => {
    await initializeWorkspace(tmpDir);

    const state: AgentState = {
      agentId: 'agent-1',
      role: 'backend-dev',
      status: 'idle',
      currentTask: null,
      lastHeartbeat: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    };

    await writeAgentState(tmpDir, state);
    const read = await readAgentState(tmpDir, 'agent-1');

    expect(read).not.toBeNull();
    expect(read!.agentId).toBe('agent-1');
    expect(read!.role).toBe('backend-dev');
    expect(read!.status).toBe('idle');
  });

  it('readAgentState — returns null for missing agent', async () => {
    await initializeWorkspace(tmpDir);
    const result = await readAgentState(tmpDir, 'nonexistent');
    expect(result).toBeNull();
  });

  it('getAllAgentStates — returns all agent states', async () => {
    await initializeWorkspace(tmpDir);

    for (const id of ['agent-1', 'agent-2', 'agent-3']) {
      await writeAgentState(tmpDir, {
        agentId: id,
        role: 'backend-dev',
        status: 'idle',
        currentTask: null,
        lastHeartbeat: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      } as AgentState);
    }

    const all = await getAllAgentStates(tmpDir);
    expect(all).toHaveLength(3);
  });

  // ─── isAgentAlive ────────────────────────────────────────────

  it('isAgentAlive — returns true for recent heartbeat', async () => {
    await initializeWorkspace(tmpDir);
    await writeAgentState(tmpDir, {
      agentId: 'agent-1',
      role: 'backend-dev',
      status: 'working',
      currentTask: null,
      lastHeartbeat: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    } as AgentState);

    expect(await isAgentAlive(tmpDir, 'agent-1')).toBe(true);
  });

  it('isAgentAlive — returns false for stale heartbeat', async () => {
    await initializeWorkspace(tmpDir);
    const staleTime = new Date(Date.now() - 60_000).toISOString();

    await writeAgentState(tmpDir, {
      agentId: 'agent-1',
      role: 'backend-dev',
      status: 'working',
      currentTask: null,
      lastHeartbeat: staleTime,
      startedAt: new Date().toISOString(),
    } as AgentState);

    expect(await isAgentAlive(tmpDir, 'agent-1', 30_000)).toBe(false);
  });

  it('isAgentAlive — returns false for missing agent', async () => {
    await initializeWorkspace(tmpDir);
    expect(await isAgentAlive(tmpDir, 'nonexistent')).toBe(false);
  });
});
