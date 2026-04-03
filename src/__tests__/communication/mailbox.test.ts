import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Mailbox } from '../../communication/mailbox.js';
import { LockManager } from '../../communication/lockManager.js';
import { createTempWorkspace, cleanTempWorkspace } from '../setup.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Mailbox', () => {
  let tmpDir: string;
  let lockManager: LockManager;
  let mailbox: Mailbox;

  beforeEach(async () => {
    tmpDir = await createTempWorkspace();
    lockManager = new LockManager(tmpDir);
    mailbox = new Mailbox(tmpDir, lockManager);
  });

  afterEach(async () => {
    await cleanTempWorkspace(tmpDir);
  });

  it('sendDirectMessage — creates message in recipient inbox', async () => {
    const msg = await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Hello');
    expect(msg.id).toMatch(/^msg-/);

    const inboxPath = path.join(tmpDir, '.agentmind', 'mailbox', 'agent-2.jsonl');
    const content = await fs.readFile(inboxPath, 'utf-8');
    expect(content).toContain('Hello');
  });

  it('sendDirectMessage — message has correct fields', async () => {
    const msg = await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Test');

    expect(msg.from).toBe('agent-1');
    expect(msg.to).toBe('agent-2');
    expect(msg.type).toBe('direct');
    expect(msg.read).toBe(false);
    expect(msg.timestamp).toBeTruthy();
    expect(msg.replyTo).toBeNull();
  });

  it('sendBroadcast — creates message in broadcast.jsonl', async () => {
    const msg = await mailbox.sendBroadcast('agent-1', 'Team announcement');

    expect(msg.type).toBe('broadcast');
    expect(msg.to).toBe('all');

    const broadcastPath = path.join(tmpDir, '.agentmind', 'mailbox', 'broadcast.jsonl');
    const content = await fs.readFile(broadcastPath, 'utf-8');
    expect(content).toContain('Team announcement');
  });

  it('sendSystemMessage — creates system message', async () => {
    const msg = await mailbox.sendSystemMessage('agent-1', 'SHUTDOWN');

    expect(msg.from).toBe('system');
    expect(msg.to).toBe('agent-1');
    expect(msg.type).toBe('system');
    expect(msg.content).toBe('SHUTDOWN');
  });

  it('getUnreadMessages — returns only unread messages', async () => {
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Msg 1');
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Msg 2');

    const unread = await mailbox.getUnreadMessages('agent-2');
    expect(unread).toHaveLength(2);
    expect(unread[0].content).toBe('Msg 1');
    expect(unread[1].content).toBe('Msg 2');
  });

  it('getUnreadMessages — returns empty array for agent with no messages', async () => {
    const unread = await mailbox.getUnreadMessages('agent-99');
    expect(unread).toEqual([]);
  });

  it('markAsRead — marks messages as read', async () => {
    const msg1 = await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Msg 1');
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Msg 2');

    await mailbox.markAsRead('agent-2', [msg1.id]);

    const unread = await mailbox.getUnreadMessages('agent-2');
    expect(unread).toHaveLength(1);
    expect(unread[0].content).toBe('Msg 2');
  });

  it('getAllMessages — returns both read and unread messages', async () => {
    const msg1 = await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Msg 1');
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Msg 2');
    await mailbox.markAsRead('agent-2', [msg1.id]);

    const all = await mailbox.getAllMessages('agent-2');
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('getConversation — returns messages between two agents sorted by timestamp', async () => {
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'From 1 to 2');
    await mailbox.sendDirectMessage('agent-2', 'agent-1', 'Reply from 2');

    const convo = await mailbox.getConversation('agent-1', 'agent-2');
    expect(convo).toHaveLength(2);
    expect(convo[0].content).toBe('From 1 to 2');
    expect(convo[1].content).toBe('Reply from 2');
  });

  it('clearInbox — removes all messages from agent inbox', async () => {
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Msg 1');
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Msg 2');

    await mailbox.clearInbox('agent-2');

    const unread = await mailbox.getUnreadMessages('agent-2');
    // Only broadcasts would remain; direct messages should be gone
    const direct = unread.filter((m) => m.type === 'direct');
    expect(direct).toHaveLength(0);
  });

  it('multiple sends — 5 messages to same inbox all appear', async () => {
    for (let i = 0; i < 5; i++) {
      await mailbox.sendDirectMessage('agent-1', 'agent-2', `Msg ${i}`);
    }

    const unread = await mailbox.getUnreadMessages('agent-2');
    expect(unread).toHaveLength(5);
  });

  it('JSONL format — each line is valid JSON', async () => {
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Line 1');
    await mailbox.sendDirectMessage('agent-1', 'agent-2', 'Line 2');

    const inboxPath = path.join(tmpDir, '.agentmind', 'mailbox', 'agent-2.jsonl');
    const raw = await fs.readFile(inboxPath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('concurrent sends — two agents sending to same inbox without corruption', async () => {
    await Promise.all([
      mailbox.sendDirectMessage('agent-1', 'agent-3', 'From 1'),
      mailbox.sendDirectMessage('agent-2', 'agent-3', 'From 2'),
    ]);

    const unread = await mailbox.getUnreadMessages('agent-3');
    expect(unread).toHaveLength(2);
    const contents = unread.map((m) => m.content).sort();
    expect(contents).toEqual(['From 1', 'From 2']);
  });
});
