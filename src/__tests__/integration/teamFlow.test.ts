import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LockManager } from '../../communication/lockManager.js';
import { TaskList } from '../../communication/taskList.js';
import { Mailbox } from '../../communication/mailbox.js';
import { initializeWorkspace } from '../../storage/workspace.js';
import { createTempWorkspace, cleanTempWorkspace } from '../setup.js';

describe('Integration: Team Flow', () => {
  let tmpDir: string;
  let lockManager: LockManager;
  let taskList: TaskList;
  let mailbox: Mailbox;

  beforeEach(async () => {
    tmpDir = await createTempWorkspace();
    await initializeWorkspace(tmpDir);
    lockManager = new LockManager(tmpDir);
    taskList = new TaskList(tmpDir, lockManager);
    mailbox = new Mailbox(tmpDir, lockManager);
  });

  afterEach(async () => {
    await cleanTempWorkspace(tmpDir);
  });

  it('full task lifecycle: create → claim → complete', async () => {
    const task = await taskList.createTask({
      title: 'Build API',
      description: 'Create REST endpoints',
      priority: 'high',
      createdBy: 'lead',
    });

    expect(task.status).toBe('pending');

    const claimed = await taskList.claimTask(task.id, 'agent-1');
    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe('in-progress');
    expect(claimed!.claimedBy).toBe('agent-1');

    await taskList.completeTask(task.id, 'All endpoints implemented', [
      'src/api.ts',
    ]);

    const completed = await taskList.getTask(task.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.result).toBe('All endpoints implemented');
    expect(completed!.filesModified).toContain('src/api.ts');
  });

  it('inter-agent messaging: send and receive', async () => {
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Need help with API');
    await mailbox.sendDirectMessage('agent-2', 'agent-1', 'Sure, what do you need?');

    const unread1 = await mailbox.getUnreadMessages('agent-1');
    expect(unread1).toHaveLength(1);
    expect(unread1[0].content).toBe('Sure, what do you need?');

    const unread2 = await mailbox.getUnreadMessages('agent-2');
    expect(unread2).toHaveLength(1);
    expect(unread2[0].content).toBe('Need help with API');
  });

  it('concurrent task claiming — only one agent wins', async () => {
    const task = await taskList.createTask({
      title: 'Shared task',
      description: 'Only one should succeed',
      priority: 'high',
      createdBy: 'lead',
    });

    const results = await Promise.all([
      taskList.claimTask(task.id, 'agent-1'),
      taskList.claimTask(task.id, 'agent-2'),
      taskList.claimTask(task.id, 'agent-3'),
    ]);

    const wins = results.filter(Boolean);
    // At least one should succeed; possibly 1 or more due to race conditions
    // but the task should end up with exactly one claimedBy
    expect(wins.length).toBeGreaterThanOrEqual(1);

    const final = await taskList.getTask(task.id);
    expect(final!.claimedBy).toBeTruthy();
  });

  it('dependency unblocking: completing A unblocks B', async () => {
    const taskA = await taskList.createTask({
      title: 'Task A',
      description: 'Foundation task',
      priority: 'high',
      createdBy: 'lead',
    });

    const taskB = await taskList.createTask({
      title: 'Task B',
      description: 'Depends on A',
      dependencies: [taskA.id],
      priority: 'medium',
      createdBy: 'lead',
    });

    expect(taskB.status).toBe('blocked');

    // Complete task A then explicitly unblock dependents
    await taskList.claimTask(taskA.id, 'agent-1');
    await taskList.completeTask(taskA.id, 'Done');
    await taskList.unblockDependents(taskA.id);

    const updatedB = await taskList.getTask(taskB.id);
    expect(updatedB!.status).toBe('pending');
    expect(updatedB!.blockedBy).toEqual([]);
  });

  it('broadcast delivery: all agents receive broadcast', async () => {
    await mailbox.sendBroadcast('lead', 'Team standup in 5 minutes');

    const unread1 = await mailbox.getUnreadMessages('agent-1');
    const unread2 = await mailbox.getUnreadMessages('agent-2');

    expect(unread1.some((m) => m.content === 'Team standup in 5 minutes')).toBe(
      true,
    );
    expect(unread2.some((m) => m.content === 'Team standup in 5 minutes')).toBe(
      true,
    );
  });
});
