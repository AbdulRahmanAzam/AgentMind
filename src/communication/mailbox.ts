import * as path from 'path';
import * as fs from 'fs/promises';
import {
  AgentMessage,
  MessageType,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import { LockManager } from './lockManager.js';
import { Logger } from '../utils/logger.js';
import { generateMessageId } from '../utils/ids.js';

/**
 * JSONL-based mailbox system for inter-agent messaging.
 *
 * Each agent has an inbox file at `.agentmind/mailbox/{agentId}.jsonl`.
 * Broadcasts go to `.agentmind/mailbox/broadcast.jsonl`.
 *
 * All writes are serialized through `LockManager` to ensure
 * append-safety across concurrent agents.
 */
export class Mailbox {
  private readonly workspaceRoot: string;
  private readonly mailboxDir: string;
  private readonly lockManager: LockManager;

  /** Per-agent offset tracking for broadcast reads (avoids re-reading). */
  private readonly broadcastOffsets = new Map<string, number>();

  constructor(workspaceRoot: string, lockManager: LockManager) {
    this.workspaceRoot = workspaceRoot;
    this.mailboxDir = path.join(
      workspaceRoot,
      AGENTMIND_CONSTANTS.MAILBOX_DIR,
    );
    this.lockManager = lockManager;
  }

  // ─── Send ─────────────────────────────────────────────────────

  /** Send a direct message from one agent to another. */
  async sendDirectMessage(
    from: string,
    to: string,
    content: string,
    replyTo?: string,
  ): Promise<AgentMessage> {
    return this.appendMessage({
      from,
      to,
      content,
      type: 'direct',
      replyTo: replyTo ?? null,
    });
  }

  /** Send a broadcast message visible to all agents. */
  async sendBroadcast(
    from: string,
    content: string,
  ): Promise<AgentMessage> {
    return this.appendMessage({
      from,
      to: 'all',
      content,
      type: 'broadcast',
      replyTo: null,
    });
  }

  /** Send a system-level notification to a specific agent. */
  async sendSystemMessage(
    to: string,
    content: string,
  ): Promise<AgentMessage> {
    return this.appendMessage({
      from: 'system',
      to,
      content,
      type: 'system',
      replyTo: null,
    });
  }

  // ─── Read ─────────────────────────────────────────────────────

  /**
   * Get unread messages for an agent.
   * This merges the agent's direct inbox with any new broadcast
   * messages since the last read.
   */
  async getUnreadMessages(agentId: string): Promise<AgentMessage[]> {
    const direct = await this.readInbox(agentId);
    const unreadDirect = direct.filter((m) => !m.read);

    const broadcasts = await this.getNewBroadcasts(agentId);

    return [...unreadDirect, ...broadcasts].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /** Mark specific messages as read in an agent's inbox. */
  async markAsRead(
    agentId: string,
    messageIds: string[],
  ): Promise<void> {
    const inboxPath = this.inboxPath(agentId);

    await this.lockManager.withLock(inboxPath, async () => {
      const messages = await this.readInbox(agentId);
      const idSet = new Set(messageIds);
      const updated = messages.map((m) =>
        idSet.has(m.id) ? { ...m, read: true } : m,
      );
      await this.writeInbox(agentId, updated);
    });
  }

  /** Read all messages from an agent's inbox (read + unread). */
  async getAllMessages(agentId: string): Promise<AgentMessage[]> {
    const direct = await this.readInbox(agentId);
    const broadcasts = await this.readBroadcasts();
    return [...direct, ...broadcasts].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /**
   * Get the full conversation thread between two agents,
   * ordered chronologically.
   */
  async getConversation(
    agentA: string,
    agentB: string,
  ): Promise<AgentMessage[]> {
    const inboxA = await this.readInbox(agentA);
    const inboxB = await this.readInbox(agentB);

    const thread = [...inboxA, ...inboxB].filter(
      (m) =>
        (m.from === agentA && m.to === agentB) ||
        (m.from === agentB && m.to === agentA),
    );

    // De-duplicate by message ID
    const seen = new Set<string>();
    const unique = thread.filter((m) => {
      if (seen.has(m.id)) {
        return false;
      }
      seen.add(m.id);
      return true;
    });

    return unique.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  /** Delete all messages from an agent's inbox. */
  async clearInbox(agentId: string): Promise<void> {
    const inboxPath = this.inboxPath(agentId);
    await this.lockManager.withLock(inboxPath, async () => {
      try {
        await fs.unlink(inboxPath);
        Logger.debug(`Inbox cleared: ${agentId}`);
      } catch {
        // File didn't exist — that's fine
      }
    });
    this.broadcastOffsets.delete(agentId);
  }

  // ─── Internals ────────────────────────────────────────────────

  /** Build and persist a new AgentMessage. */
  private async appendMessage(opts: {
    from: string;
    to: string;
    content: string;
    type: MessageType;
    replyTo: string | null;
  }): Promise<AgentMessage> {
    await fs.mkdir(this.mailboxDir, { recursive: true });

    const message: AgentMessage = {
      id: generateMessageId(),
      from: opts.from,
      to: opts.to,
      content: opts.content,
      type: opts.type,
      timestamp: new Date().toISOString(),
      read: false,
      replyTo: opts.replyTo,
    };

    if (opts.type === 'broadcast') {
      await this.appendToBroadcast(message);
    } else {
      await this.appendToInbox(opts.to, message);
    }

    Logger.debug(
      `Message ${message.id}: ${opts.from} → ${opts.to} [${opts.type}]`,
    );
    return message;
  }

  /** Append a message to a specific agent's JSONL inbox. */
  private async appendToInbox(
    agentId: string,
    message: AgentMessage,
  ): Promise<void> {
    const inboxPath = this.inboxPath(agentId);

    await this.lockManager.withLock(inboxPath, async () => {
      await fs.appendFile(
        inboxPath,
        JSON.stringify(message) + '\n',
        'utf-8',
      );
    });
  }

  /** Append a message to the broadcast JSONL file. */
  private async appendToBroadcast(message: AgentMessage): Promise<void> {
    const broadcastPath = this.broadcastPath();

    await this.lockManager.withLock(broadcastPath, async () => {
      await fs.appendFile(
        broadcastPath,
        JSON.stringify(message) + '\n',
        'utf-8',
      );
    });
  }

  /** Read all messages from an agent's JSONL inbox. */
  private async readInbox(agentId: string): Promise<AgentMessage[]> {
    return this.readJsonl(this.inboxPath(agentId));
  }

  /** Read all broadcast messages. */
  private async readBroadcasts(): Promise<AgentMessage[]> {
    return this.readJsonl(this.broadcastPath());
  }

  /**
   * Get broadcast messages that this agent hasn't seen yet.
   * Uses an in-memory offset counter per agent.
   */
  private async getNewBroadcasts(
    agentId: string,
  ): Promise<AgentMessage[]> {
    const all = await this.readBroadcasts();
    const offset = this.broadcastOffsets.get(agentId) ?? 0;
    const newMessages = all.slice(offset).filter(
      // Don't deliver an agent's own broadcasts back to them
      (m) => m.from !== agentId,
    );
    this.broadcastOffsets.set(agentId, all.length);
    return newMessages;
  }

  /** Overwrite an agent's inbox with a full array (for markAsRead). */
  private async writeInbox(
    agentId: string,
    messages: AgentMessage[],
  ): Promise<void> {
    const content = messages.map((m) => JSON.stringify(m)).join('\n');
    await fs.writeFile(
      this.inboxPath(agentId),
      content ? content + '\n' : '',
      'utf-8',
    );
  }

  /** Parse a JSONL file into an array of messages. */
  private async readJsonl(filePath: string): Promise<AgentMessage[]> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as AgentMessage);
    } catch {
      return [];
    }
  }

  /** Absolute path to an agent's inbox JSONL file. */
  private inboxPath(agentId: string): string {
    return path.join(this.mailboxDir, `${agentId}.jsonl`);
  }

  /** Absolute path to the broadcast JSONL file. */
  private broadcastPath(): string {
    return path.join(this.workspaceRoot, AGENTMIND_CONSTANTS.BROADCAST_FILE);
  }
}
