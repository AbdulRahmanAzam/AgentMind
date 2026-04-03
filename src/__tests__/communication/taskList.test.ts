import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskList, CreateTaskOptions } from '../../communication/taskList.js';
import { LockManager } from '../../communication/lockManager.js';
import { createTempWorkspace, cleanTempWorkspace } from '../setup.js';

describe('TaskList', () => {
  let tmpDir: string;
  let lockManager: LockManager;
  let taskList: TaskList;

  const defaultOpts: CreateTaskOptions = {
    title: 'Test task',
    description: 'A test task description',
    createdBy: 'lead',
    priority: 'medium',
  };

  beforeEach(async () => {
    tmpDir = await createTempWorkspace();
    lockManager = new LockManager(tmpDir);
    taskList = new TaskList(tmpDir, lockManager);
  });

  afterEach(async () => {
    await cleanTempWorkspace(tmpDir);
  });

  it('createTask — creates a task with correct fields and generated ID', async () => {
    const task = await taskList.createTask(defaultOpts);

    expect(task.id).toMatch(/^task-\d{3}$/);
    expect(task.title).toBe('Test task');
    expect(task.description).toBe('A test task description');
    expect(task.status).toBe('pending');
    expect(task.assignedTo).toBeNull();
    expect(task.claimedBy).toBeNull();
    expect(task.createdBy).toBe('lead');
    expect(task.priority).toBe('medium');
    expect(task.dependencies).toEqual([]);
    expect(task.blockedBy).toEqual([]);
    expect(task.result).toBeNull();
    expect(task.filesModified).toEqual([]);
    expect(task.createdAt).toBeTruthy();
    expect(task.startedAt).toBeNull();
    expect(task.completedAt).toBeNull();
  });

  it('getTask — retrieves a created task by ID', async () => {
    const created = await taskList.createTask(defaultOpts);
    const fetched = await taskList.getTask(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.title).toBe('Test task');
  });

  it('getTask — returns null for non-existent task', async () => {
    const result = await taskList.getTask('task-999');
    expect(result).toBeNull();
  });

  it('getAllTasks — returns all tasks sorted by priority', async () => {
    await taskList.createTask({ ...defaultOpts, title: 'Low', priority: 'low' });
    await taskList.createTask({ ...defaultOpts, title: 'Critical', priority: 'critical' });
    await taskList.createTask({ ...defaultOpts, title: 'High', priority: 'high' });

    const all = await taskList.getAllTasks();
    expect(all).toHaveLength(3);
    expect(all[0].title).toBe('Critical');
    expect(all[1].title).toBe('High');
    expect(all[2].title).toBe('Low');
  });

  it('claimTask — successfully claims a pending task', async () => {
    const task = await taskList.createTask({
      ...defaultOpts,
      assignedTo: 'agent-1',
    });

    const claimed = await taskList.claimTask(task.id, 'agent-1');
    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe('in-progress');
    expect(claimed!.claimedBy).toBe('agent-1');
    expect(claimed!.startedAt).toBeTruthy();
  });

  it('claimTask — returns null when trying to claim an already-claimed task', async () => {
    const task = await taskList.createTask({
      ...defaultOpts,
      assignedTo: 'agent-1',
    });

    await taskList.claimTask(task.id, 'agent-1');
    const secondClaim = await taskList.claimTask(task.id, 'agent-2');
    expect(secondClaim).toBeNull();
  });

  it('claimTask — returns null when trying to claim a blocked task', async () => {
    // Create a dependency task first
    const dep = await taskList.createTask(defaultOpts);
    const blocked = await taskList.createTask({
      ...defaultOpts,
      title: 'Blocked task',
      dependencies: [dep.id],
    });

    // The blocked task should have status 'blocked'
    const fetched = await taskList.getTask(blocked.id);
    expect(fetched!.status).toBe('blocked');

    const claimed = await taskList.claimTask(blocked.id, 'agent-1');
    expect(claimed).toBeNull();
  });

  it('completeTask — marks task completed with result and filesModified', async () => {
    const task = await taskList.createTask(defaultOpts);
    await taskList.claimTask(task.id, 'agent-1');

    const completed = await taskList.completeTask(task.id, 'Done successfully', ['src/index.ts']);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('completed');
    expect(completed!.result).toBe('Done successfully');
    expect(completed!.filesModified).toEqual(['src/index.ts']);
    expect(completed!.completedAt).toBeTruthy();
  });

  it('completeTask + unblockDependents — triggers unblocking', async () => {
    const taskA = await taskList.createTask({ ...defaultOpts, title: 'Task A' });
    const taskB = await taskList.createTask({
      ...defaultOpts,
      title: 'Task B',
      dependencies: [taskA.id],
    });

    // B should be blocked
    let fetchedB = await taskList.getTask(taskB.id);
    expect(fetchedB!.status).toBe('blocked');

    // Complete A
    await taskList.completeTask(taskA.id, 'A done', []);
    const unblocked = await taskList.unblockDependents(taskA.id);
    expect(unblocked).toContain(taskB.id);

    // B should now be pending
    fetchedB = await taskList.getTask(taskB.id);
    expect(fetchedB!.status).toBe('pending');
  });

  it('failTask — marks task as failed with error message', async () => {
    const task = await taskList.createTask(defaultOpts);
    const failed = await taskList.failTask(task.id, 'Something broke');

    expect(failed).not.toBeNull();
    expect(failed!.status).toBe('failed');
    expect(failed!.result).toBe('Something broke');
    expect(failed!.completedAt).toBeTruthy();
  });

  it('getAvailableTasks — returns only pending, unblocked, unclaimed tasks', async () => {
    const t1 = await taskList.createTask({ ...defaultOpts, title: 'Available' });
    const t2 = await taskList.createTask({ ...defaultOpts, title: 'Claimed' });
    await taskList.claimTask(t2.id, 'agent-1');

    const dep = await taskList.createTask({ ...defaultOpts, title: 'Dep' });
    const blocked = await taskList.createTask({
      ...defaultOpts,
      title: 'Blocked',
      dependencies: [dep.id],
    });

    const available = await taskList.getAvailableTasks();
    const titles = available.map((t) => t.title);
    expect(titles).toContain('Available');
    expect(titles).toContain('Dep');
    expect(titles).not.toContain('Claimed');
    expect(titles).not.toContain('Blocked');
  });

  it('getTasksByAgent — returns tasks assigned to a specific agent', async () => {
    await taskList.createTask({ ...defaultOpts, title: 'T1', assignedTo: 'agent-1' });
    await taskList.createTask({ ...defaultOpts, title: 'T2', assignedTo: 'agent-2' });
    await taskList.createTask({ ...defaultOpts, title: 'T3', assignedTo: 'agent-1' });

    const agent1Tasks = await taskList.getTasksByAgent('agent-1');
    expect(agent1Tasks).toHaveLength(2);
    expect(agent1Tasks.map((t) => t.title).sort()).toEqual(['T1', 'T3']);
  });

  it('getTaskSummary — returns correct counts per status', async () => {
    const t1 = await taskList.createTask(defaultOpts);
    const t2 = await taskList.createTask(defaultOpts);
    const t3 = await taskList.createTask(defaultOpts);

    await taskList.claimTask(t1.id, 'agent-1');
    await taskList.completeTask(t2.id, 'done', []);
    await taskList.failTask(t3.id, 'error');

    const summary = await taskList.getTaskSummary();
    expect(summary['in-progress']).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it('concurrent claims — only one agent succeeds', async () => {
    const task = await taskList.createTask({
      ...defaultOpts,
      assignedTo: null,
    });

    const results = await Promise.all([
      taskList.claimTask(task.id, 'agent-1'),
      taskList.claimTask(task.id, 'agent-2'),
      taskList.claimTask(task.id, 'agent-3'),
    ]);

    const successes = results.filter((r) => r !== null);
    expect(successes.length).toBe(1);
  });

  it('dependency chain — A → B → C: completing A unblocks B, completing B unblocks C', async () => {
    const taskA = await taskList.createTask({ ...defaultOpts, title: 'A' });
    const taskB = await taskList.createTask({
      ...defaultOpts,
      title: 'B',
      dependencies: [taskA.id],
    });
    const taskC = await taskList.createTask({
      ...defaultOpts,
      title: 'C',
      dependencies: [taskB.id],
    });

    // Initially B and C are blocked
    expect((await taskList.getTask(taskB.id))!.status).toBe('blocked');
    expect((await taskList.getTask(taskC.id))!.status).toBe('blocked');

    // Complete A → unblock B
    await taskList.completeTask(taskA.id, 'A done', []);
    await taskList.unblockDependents(taskA.id);
    expect((await taskList.getTask(taskB.id))!.status).toBe('pending');
    expect((await taskList.getTask(taskC.id))!.status).toBe('blocked');

    // Complete B → unblock C
    await taskList.completeTask(taskB.id, 'B done', []);
    await taskList.unblockDependents(taskB.id);
    expect((await taskList.getTask(taskC.id))!.status).toBe('pending');
  });
});
