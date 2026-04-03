import * as vscode from 'vscode';
import { TeamConfig, AGENTMIND_CONSTANTS } from '../types.js';
import { OnboardingFlow } from './onboarding.js';
import { AgentLLM } from '../llm/modelAccess.js';
import { AgentManager } from '../orchestrator/agentManager.js';
import { TeamLead } from '../orchestrator/teamLead.js';
import { TaskList } from '../communication/taskList.js';
import { Mailbox } from '../communication/mailbox.js';
import { LockManager } from '../communication/lockManager.js';
import { initializeWorkspace, cleanupWorkspace } from '../storage/workspace.js';
import {
  generateAgentmindMd,
  writeAgentmindMd,
} from '../storage/agentmindMd.js';
import { Logger } from '../utils/logger.js';

// ─── Active session state ───────────────────────────────────────

let activeTeamConfig: TeamConfig | null = null;
let activeAgentManager: AgentManager | null = null;
let activeTeamLead: TeamLead | null = null;
let activeTokenSource: vscode.CancellationTokenSource | null = null;

/** Get the active agent manager (used by extension.ts stop command). */
export function getActiveAgentManager(): AgentManager | null {
  return activeAgentManager;
}

/** Get the active team lead. */
export function getActiveTeamLead(): TeamLead | null {
  return activeTeamLead;
}

/** Whether a team is currently executing. */
export function isTeamActive(): boolean {
  return activeAgentManager !== null;
}

// ─── Chat request handler ───────────────────────────────────────

/**
 * Main chat handler for the @agentmind participant.
 *
 * Routes requests through:
 * 1. Slash commands (/status, /stop, /plan)
 * 2. Onboarding flow (team size → roles → confirm)
 * 3. General messages forwarded to the lead during execution
 */
export const chatHandler: vscode.ChatRequestHandler = async (
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> => {
  // ── Slash commands ────────────────────────────────────────
  if (request.command === 'status') {
    return handleStatus(stream);
  }

  if (request.command === 'stop') {
    return handleStop(stream);
  }

  if (request.command === 'plan') {
    return handlePlan(request, stream, token);
  }

  // ── Existing team → forward message to lead ───────────────
  if (activeTeamLead && activeAgentManager) {
    stream.markdown(
      `📨 Forwarding your message to the Team Lead...\n\n> ${request.prompt}`,
    );
    return {};
  }

  // ── No active team → start or continue onboarding ─────────
  const globalState = getGlobalState();
  if (!globalState) {
    stream.markdown('❌ AgentMind failed to initialize. Please reload the window.');
    return {};
  }

  const prompt = request.prompt.trim();
  if (!prompt) {
    stream.markdown(
      '🤖 **AgentMind** — Describe a task and I\'ll assemble a team of AI agents to work on it.\n\n' +
      'Example: _"Build a REST API for a todo app with tests and documentation"_',
    );
    return {};
  }

  // Determine if this is a new task or a response to onboarding
  const onboarding = new OnboardingFlow(globalState, prompt);

  // If there's an active onboarding AND the prompt looks like a response to it, continue the flow
  if (OnboardingFlow.hasActive(globalState)) {
    const continueOnboarding = new OnboardingFlow(
      globalState,
      '', // use existing task
    );
    // Re-construct with existing state
    const existingState = globalState.get<{ taskDescription: string }>('agentmind.onboarding');
    if (existingState) {
      const flow = new OnboardingFlow(globalState, existingState.taskDescription);
      const result = await flow.render(stream, prompt);

      if (result.complete && result.teamConfig) {
        await startTeam(result.teamConfig, stream, token);
      }
      return {};
    }
  }

  // New task → begin fresh onboarding
  const freshOnboarding = new OnboardingFlow(globalState, prompt);
  const result = await freshOnboarding.render(stream);

  if (result.complete && result.teamConfig) {
    await startTeam(result.teamConfig, stream, token);
  }

  return {};
};

// ─── Slash command handlers ─────────────────────────────────────

function handleStatus(stream: vscode.ChatResponseStream): vscode.ChatResult {
  if (!activeAgentManager || !activeTeamLead) {
    stream.markdown('📊 **No active team.** Start one by describing a task to `@agentmind`.');
    return {};
  }

  const status = activeAgentManager.getTeamStatus();
  const phase = activeTeamLead.getPhase();
  const phaseStatus = activeTeamLead.getPhaseStatus();

  const phaseEmojis: Record<string, string> = {
    planning: '📋', assigning: '📌', monitoring: '👀',
    verifying: '✅', debugging: '🐛', completing: '🏁',
  };

  const agentLines = status.agents
    .map((a) => `- ${a.active ? '🟢' : '🔴'} **${a.role}** (\`${a.id}\`)`)
    .join('\n');

  const phases = [
    `${phaseStatus.planning ? '✅' : '⬜'} Planning`,
    `${phaseStatus.execution ? '✅' : '⬜'} Execution`,
    `${phaseStatus.testing ? '✅' : '⬜'} Testing`,
    `${phaseStatus.debugging ? '✅' : '⬜'} Debugging`,
    `${phaseStatus.completion ? '✅' : '⬜'} Completion`,
  ].join(' → ');

  stream.markdown(
    `📊 **Team Status**\n\n` +
    `**Current Phase:** ${phaseEmojis[phase] ?? '❓'} ${phase}\n\n` +
    `**Progress:** ${phases}\n\n` +
    `**Agents (${status.agentCount}):**\n${agentLines}`,
  );

  return {};
}

async function handleStop(stream: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
  if (!activeAgentManager) {
    stream.markdown('⏹️ **No active team to stop.**');
    return {};
  }

  stream.markdown('⏹️ **Stopping team...** Shutting down all agents.');

  await shutdownTeam('User requested stop');

  stream.markdown('\n\n✅ Team stopped. All agents have been shut down.');
  return {};
}

async function handlePlan(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  if (!request.prompt) {
    stream.markdown(
      '📋 **Plan mode** — Provide a task after `/plan` and I\'ll create a decomposition without starting agents.',
    );
    return {};
  }

  stream.markdown(
    `📋 **Planning mode** — Creating a task decomposition for:\n> ${request.prompt}\n\n` +
    `_This is a dry run. No agents will be spawned._\n\n---\n\n`,
  );

  try {
    const model = await AgentLLM.selectModel();
    const { TaskPlanner } = await import('../orchestrator/taskPlanner.js');
    const { ROLE_PRESETS } = await import('../roles/presets.js');

    const lockManager = new LockManager('');
    const taskList = new TaskList('', lockManager); // dummy, not used for plan-only
    const planner = new TaskPlanner(taskList);
    const plan = await planner.decompose(request.prompt, ROLE_PRESETS, model, token);

    stream.markdown(`**Reasoning:** ${plan.reasoning}\n\n**Tasks (${plan.tasks.length}):**\n\n`);
    for (let i = 0; i < plan.tasks.length; i++) {
      const t = plan.tasks[i];
      const deps = t.dependencies.length > 0
        ? ` (depends on: ${t.dependencies.map((d) => `#${d + 1}`).join(', ')})`
        : '';
      stream.markdown(
        `${i + 1}. **${t.title}** [${t.priority}] → ${t.assignedRole}${deps}\n` +
        `   ${t.description.slice(0, 150)}...\n\n`,
      );
    }
  } catch (err) {
    stream.markdown(`❌ Planning failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {};
}

// ─── Team lifecycle ─────────────────────────────────────────────

async function startTeam(
  teamConfig: TeamConfig,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    stream.markdown('❌ No workspace folder open. AgentMind needs an open folder to operate.');
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  try {
    // Initialize .agentmind/ workspace
    await initializeWorkspace(workspaceRoot);

    // Generate and write AGENTMIND.md handbook
    const handbook = generateAgentmindMd(teamConfig, [], '', '');
    await writeAgentmindMd(workspaceRoot, handbook);

    // Set up communication infrastructure
    const lockManager = new LockManager(workspaceRoot);
    const taskList = new TaskList(workspaceRoot, lockManager);
    const mailbox = new Mailbox(workspaceRoot, lockManager);

    // Select LLM model
    const model = await AgentLLM.selectModel();

    // Create agent manager
    const agentManager = new AgentManager(
      taskList,
      mailbox,
      workspaceRoot,
      teamConfig.taskDescription,
    );
    agentManager.setModel(model);

    // Create cancellation source for all agents
    const tokenSource = new vscode.CancellationTokenSource();
    agentManager.setTokenSource(tokenSource);

    // Spawn all teammate agents
    await agentManager.spawnAll(teamConfig);

    // Create and initialize Team Lead
    const teamLead = new TeamLead(
      teamConfig,
      agentManager,
      taskList,
      mailbox,
      workspaceRoot,
    );
    await teamLead.initialize(model);

    // Store active references
    activeTeamConfig = teamConfig;
    activeAgentManager = agentManager;
    activeTeamLead = teamLead;
    activeTokenSource = tokenSource;

    stream.markdown(
      '\n\n✅ **Team is live!** Agents are running in their terminal tabs.\n\n' +
      'Use `/status` to check progress or `/stop` to shut down the team.',
    );

    // Fire-and-forget the lead execution
    teamLead.execute(tokenSource.token).then(async () => {
      Logger.info('TeamLead execution completed normally.');
      await shutdownTeam('Execution completed');
    }).catch(async (err) => {
      Logger.error(`TeamLead execution failed: ${err}`);
      await shutdownTeam(`Execution failed: ${err}`);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stream.markdown(`\n\n❌ **Failed to start team:** ${message}`);
    Logger.error(`Failed to start team: ${message}`);
  }
}

async function shutdownTeam(reason: string): Promise<void> {
  Logger.info(`Shutting down team: ${reason}`);

  try {
    await activeAgentManager?.shutdownAll(reason);
  } catch (err) {
    Logger.error(`Error during agent shutdown: ${err}`);
  }

  activeTeamLead?.dispose();

  // Clean up .agentmind/ directory
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    try {
      await cleanupWorkspace(workspaceFolders[0].uri.fsPath);
    } catch {
      // Best-effort cleanup
    }
  }

  activeTeamConfig = null;
  activeAgentManager = null;
  activeTeamLead = null;
  activeTokenSource?.dispose();
  activeTokenSource = null;
}

// ─── Follow-up provider ────────────────────────────────────────

/**
 * Provides context-aware follow-up suggestions based on current state.
 */
export const followupProvider: vscode.ChatFollowupProvider = {
  provideFollowups(
    _result: vscode.ChatResult,
    _context: vscode.ChatContext,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.ChatFollowup[]> {
    if (activeAgentManager) {
      return [
        { prompt: '/status', label: '📊 Check team status' },
        { prompt: '/stop', label: '⏹️ Stop team' },
      ];
    }

    return [
      {
        prompt: 'Build a REST API with Express, tests, and documentation',
        label: '🚀 Example: REST API project',
      },
      {
        prompt: '/plan Refactor this codebase to use TypeScript strict mode',
        label: '📋 Example: Plan a refactor',
      },
    ];
  },
};

// ─── Helpers ────────────────────────────────────────────────────

/** Exported for use by extension.ts shutdown logic. */
export { shutdownTeam };

function getGlobalState(): vscode.Memento | null {
  try {
    const { getExtensionContext } = require('../extension.js');
    const ctx = getExtensionContext();
    return ctx?.globalState ?? null;
  } catch {
    return null;
  }
}
