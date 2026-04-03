import * as vscode from 'vscode';
import {
  AgentRole,
  TeamConfig,
  TeamAgentConfig,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import { AgentLLM } from '../llm/modelAccess.js';
import { TaskList } from '../communication/taskList.js';
import { Mailbox } from '../communication/mailbox.js';
import { LockManager } from '../communication/lockManager.js';
import { TeammateAgent } from './teammate.js';
import { createAgentTerminal, AgentPseudoterminal } from '../terminal/agentTerminal.js';
import { readAgentmindMd } from '../storage/agentmindMd.js';
import { generateAgentId } from '../utils/ids.js';
import { Logger } from '../utils/logger.js';

/** Health check interval in ms. */
const HEALTH_CHECK_INTERVAL_MS = 15_000;

interface ManagedAgent {
  agent: TeammateAgent;
  pty: AgentPseudoterminal;
  terminal: vscode.Terminal;
}

/**
 * Manages the lifecycle of all teammate agents:
 * spawn, monitor health, shutdown.
 */
export class AgentManager {
  private readonly agents = new Map<string, ManagedAgent>();
  private readonly taskList: TaskList;
  private readonly mailbox: Mailbox;
  private readonly workspaceRoot: string;
  private readonly taskDescription: string;
  private model: vscode.LanguageModelChat | null = null;
  private tokenSource: vscode.CancellationTokenSource | null = null;

  constructor(
    taskList: TaskList,
    mailbox: Mailbox,
    workspaceRoot: string,
    taskDescription: string,
  ) {
    this.taskList = taskList;
    this.mailbox = mailbox;
    this.workspaceRoot = workspaceRoot;
    this.taskDescription = taskDescription;
  }

  /** Set the shared LLM model for all agents. */
  setModel(model: vscode.LanguageModelChat): void {
    this.model = model;
  }

  /** Set the cancellation token source for all agent loops. */
  setTokenSource(tokenSource: vscode.CancellationTokenSource): void {
    this.tokenSource = tokenSource;
  }

  /**
   * Spawn a single teammate agent: create PTY, terminal, TeammateAgent,
   * inject system context, then fire-and-forget the agent loop.
   */
  async spawnTeammate(config: TeamAgentConfig): Promise<TeammateAgent> {
    if (!this.model) {
      throw new Error('AgentManager: model not set — call setModel() first.');
    }
    if (!this.tokenSource) {
      throw new Error('AgentManager: token source not set.');
    }

    const { terminal, pty } = createAgentTerminal(
      config.agentId,
      config.role.name,
      config.role.icon,
    );

    const teammateIds = [...this.agents.keys()].filter(
      (id) => id !== config.agentId,
    );

    const agent = new TeammateAgent({
      agentId: config.agentId,
      role: config.role,
      pty,
      taskList: this.taskList,
      mailbox: this.mailbox,
      workspaceRoot: this.workspaceRoot,
      taskDescription: this.taskDescription,
      teammateIds,
    });

    agent.setModel(this.model);

    // Inject AGENTMIND.md context if available
    try {
      const handbook = await readAgentmindMd(this.workspaceRoot);
      if (handbook) {
        agent.addSystemContext(
          `\n## Project Handbook\n${handbook}`,
        );
      }
    } catch {
      // OK if handbook doesn't exist yet
    }

    this.agents.set(config.agentId, { agent, pty, terminal });
    terminal.show(true); // preserve focus

    // Fire-and-forget the agent loop
    const token = this.tokenSource.token;
    agent.start(token).catch((err) => {
      Logger.error(
        `Agent ${config.agentId} crashed: ${err instanceof Error ? err.message : String(err)}`,
      );
      pty.writeError(`Agent crashed: ${err}`);
    });

    Logger.info(`AgentManager: spawned ${config.agentId} (${config.role.name})`);
    return agent;
  }

  /**
   * Spawn all agents from a TeamConfig.
   */
  async spawnAll(teamConfig: TeamConfig): Promise<void> {
    for (const agentConfig of teamConfig.agents) {
      await this.spawnTeammate(agentConfig);
    }
    Logger.info(
      `AgentManager: all ${teamConfig.agents.length} agents spawned.`,
    );
  }

  /**
   * Gracefully shut down a single agent.
   */
  async shutdownTeammate(agentId: string): Promise<void> {
    const managed = this.agents.get(agentId);
    if (!managed) {
      Logger.warn(`AgentManager: unknown agent ${agentId}`);
      return;
    }

    managed.agent.shutdown();
    managed.pty.writeInfo('Shutting down...');

    // Give the agent a moment to finish, then dispose terminal
    setTimeout(() => {
      try {
        managed.terminal.dispose();
      } catch {
        // May already be disposed
      }
    }, 2000);

    this.agents.delete(agentId);
    Logger.info(`AgentManager: shut down ${agentId}`);
  }

  /**
   * Shut down all agents and dispose resources.
   */
  async shutdownAll(reason?: string): Promise<void> {
    Logger.info(`AgentManager: shutting down all agents. Reason: ${reason ?? 'none'}`);

    // Cancel all agent loops
    this.tokenSource?.cancel();

    const ids = [...this.agents.keys()];
    for (const id of ids) {
      await this.shutdownTeammate(id);
    }

    this.agents.clear();
    Logger.info('AgentManager: all agents shut down.');
  }

  /**
   * Get a summary of team status for the chat UI.
   */
  getTeamStatus(): {
    agentCount: number;
    agents: { id: string; role: string; active: boolean }[];
  } {
    const agents = [...this.agents.entries()].map(([id, managed]) => ({
      id,
      role: managed.agent.role.name,
      active: managed.agent.isActive(),
    }));

    return {
      agentCount: agents.length,
      agents,
    };
  }

  /**
   * Check health of all agents (heartbeat-based).
   * Returns IDs of agents that appear stalled.
   */
  async monitorHealth(): Promise<string[]> {
    const stalled: string[] = [];

    for (const [id, managed] of this.agents) {
      if (!managed.agent.isActive()) {
        stalled.push(id);
      }
    }

    return stalled;
  }

  /** Get a specific managed agent by ID. */
  getAgent(agentId: string): TeammateAgent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  /** Get the PTY for a specific agent. */
  getPty(agentId: string): AgentPseudoterminal | undefined {
    return this.agents.get(agentId)?.pty;
  }

  /** Number of spawned agents. */
  get size(): number {
    return this.agents.size;
  }
}
