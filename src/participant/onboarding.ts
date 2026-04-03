import * as vscode from 'vscode';
import {
  AgentRole,
  TeamConfig,
  TeamAgentConfig,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import {
  ROLE_PRESETS,
  getRoleById,
  getRolePresetOptions,
  LEAD_DECIDES_OPTION,
  CUSTOM_ROLE_OPTION,
} from '../roles/presets.js';
import { generateAgentId, generateTeamId } from '../utils/ids.js';
import { Logger } from '../utils/logger.js';

// ─── Onboarding state ───────────────────────────────────────────

/** Steps of the onboarding flow. */
export type OnboardingStep =
  | 'ask-team-size'
  | 'ask-roles'
  | 'confirm'
  | 'create-team';

/** Persisted onboarding state stored in extension globalState. */
export interface OnboardingState {
  step: OnboardingStep;
  taskDescription: string;
  teamSize: number;
  /** Role IDs selected so far (one per agent slot). */
  selectedRoles: string[];
  /** Index of the agent slot currently being configured. */
  currentSlot: number;
}

const STATE_KEY = 'agentmind.onboarding';

// ─── OnboardingFlow ─────────────────────────────────────────────

/**
 * An interactive onboarding flow within the Copilot Chat panel.
 *
 * Uses `stream.button()` for follow-up interactions and
 * persists state via `ExtensionContext.globalState` so it
 * survives across separate chat turns.
 */
export class OnboardingFlow {
  private state: OnboardingState;
  private readonly globalState: vscode.Memento;

  constructor(
    globalState: vscode.Memento,
    taskDescription: string,
  ) {
    this.globalState = globalState;

    // Try to resume existing state
    const saved = globalState.get<OnboardingState>(STATE_KEY);
    if (saved && saved.taskDescription === taskDescription) {
      this.state = saved;
    } else {
      this.state = {
        step: 'ask-team-size',
        taskDescription,
        teamSize: 0,
        selectedRoles: [],
        currentSlot: 0,
      };
    }
  }

  /** Render the current step into the chat stream. Returns true when onboarding is complete. */
  async render(
    stream: vscode.ChatResponseStream,
    userResponse?: string,
  ): Promise<{ complete: boolean; teamConfig?: TeamConfig }> {
    switch (this.state.step) {
      case 'ask-team-size':
        return this.handleAskTeamSize(stream, userResponse);
      case 'ask-roles':
        return this.handleAskRoles(stream, userResponse);
      case 'confirm':
        return this.handleConfirm(stream, userResponse);
      case 'create-team':
        return this.handleCreateTeam(stream);
      default:
        return { complete: false };
    }
  }

  /** Reset the onboarding state. */
  async reset(): Promise<void> {
    this.state = {
      step: 'ask-team-size',
      taskDescription: this.state.taskDescription,
      teamSize: 0,
      selectedRoles: [],
      currentSlot: 0,
    };
    await this.save();
  }

  /** Clear persisted state. */
  async clear(): Promise<void> {
    await this.globalState.update(STATE_KEY, undefined);
  }

  /** Check if there's an active onboarding in progress. */
  static hasActive(globalState: vscode.Memento): boolean {
    return globalState.get<OnboardingState>(STATE_KEY) !== undefined;
  }

  // ─── Step handlers ────────────────────────────────────────────

  private async handleAskTeamSize(
    stream: vscode.ChatResponseStream,
    userResponse?: string,
  ): Promise<{ complete: boolean; teamConfig?: TeamConfig }> {
    if (userResponse) {
      const parsed = this.parseTeamSize(userResponse);
      if (parsed !== null) {
        this.state.teamSize = parsed;
        this.state.step = 'ask-roles';
        this.state.currentSlot = 0;
        this.state.selectedRoles = [];
        await this.save();
        return this.handleAskRoles(stream);
      }
    }

    stream.markdown(
      `🤖 **AgentMind — Team Configuration**\n\n` +
      `I'll help you set up a team to work on:\n> ${this.state.taskDescription}\n\n` +
      `**How many agents should be on the team?**\n\n` +
      `Respond with a number (1-6), or say "auto" to let me decide.\n\n` +
      `_Tip: 2-3 agents work well for most tasks. More agents = more parallelism but more coordination overhead._`,
    );

    stream.button({
      command: '',
      title: '2 agents (recommended)',
      arguments: [],
    });
    stream.button({
      command: '',
      title: '3 agents',
      arguments: [],
    });

    await this.save();
    return { complete: false };
  }

  private async handleAskRoles(
    stream: vscode.ChatResponseStream,
    userResponse?: string,
  ): Promise<{ complete: boolean; teamConfig?: TeamConfig }> {
    if (userResponse) {
      const roleId = this.parseRoleSelection(userResponse);
      if (roleId) {
        this.state.selectedRoles.push(roleId);
        this.state.currentSlot++;
        await this.save();

        if (this.state.currentSlot >= this.state.teamSize) {
          this.state.step = 'confirm';
          await this.save();
          return this.handleConfirm(stream);
        }
      }
    }

    const slot = this.state.currentSlot + 1;
    const total = this.state.teamSize;
    const alreadySelected = this.state.selectedRoles
      .map((id) => getRoleById(id)?.name ?? id)
      .join(', ');

    stream.markdown(
      `**Agent ${slot}/${total}** — Choose a role:\n\n` +
      (alreadySelected ? `_Selected so far: ${alreadySelected}_\n\n` : '') +
      getRolePresetOptions()
        .map((r, i) => `${i + 1}. **${r.name}** ${r.icon} — ${r.description}`)
        .join('\n') +
      `\n\nReply with the role name, number, or "auto".`,
    );

    await this.save();
    return { complete: false };
  }

  private async handleConfirm(
    stream: vscode.ChatResponseStream,
    userResponse?: string,
  ): Promise<{ complete: boolean; teamConfig?: TeamConfig }> {
    if (userResponse) {
      const lower = userResponse.toLowerCase().trim();
      if (lower === 'yes' || lower === 'confirm' || lower === 'go' || lower === 'start') {
        this.state.step = 'create-team';
        await this.save();
        return this.handleCreateTeam(stream);
      }
      if (lower === 'no' || lower === 'restart' || lower === 'reset') {
        await this.reset();
        return this.handleAskTeamSize(stream);
      }
    }

    const roster = this.state.selectedRoles.map((id, i) => {
      const role = getRoleById(id);
      return `${i + 1}. **${role?.name ?? id}** ${role?.icon ?? ''}`;
    });

    stream.markdown(
      `**Team Configuration Summary:**\n\n` +
      `**Task:** ${this.state.taskDescription}\n\n` +
      `**Team (${this.state.teamSize} agents):**\n${roster.join('\n')}\n\n` +
      `Confirm this team? Reply **yes** to start or **no** to reconfigure.`,
    );

    stream.button({
      command: '',
      title: '✅ Start Team',
      arguments: [],
    });
    stream.button({
      command: '',
      title: '🔄 Reconfigure',
      arguments: [],
    });

    await this.save();
    return { complete: false };
  }

  private async handleCreateTeam(
    stream: vscode.ChatResponseStream,
  ): Promise<{ complete: boolean; teamConfig?: TeamConfig }> {
    const agents: TeamAgentConfig[] = this.state.selectedRoles.map((roleId) => {
      const role = getRoleById(roleId);
      if (!role) {
        throw new Error(`Unknown role: ${roleId}`);
      }
      return {
        agentId: generateAgentId(roleId),
        role,
        assignedByUser: true,
      };
    });

    const teamConfig: TeamConfig = {
      teamId: generateTeamId(),
      taskDescription: this.state.taskDescription,
      agents,
      createdAt: new Date().toISOString(),
      status: 'planning',
    };

    stream.markdown(
      `🚀 **Team Created!**\n\n` +
      `Team ID: \`${teamConfig.teamId}\`\n\n` +
      agents
        .map((a) => `- ${a.role.icon} **${a.role.name}** (\`${a.agentId}\`)`)
        .join('\n') +
      `\n\nSpawning agents and starting the Team Lead...`,
    );

    // Clear onboarding state
    await this.clear();

    Logger.info(
      `Onboarding complete: team ${teamConfig.teamId} with ${agents.length} agents`,
    );

    return { complete: true, teamConfig };
  }

  // ─── Parsing helpers ──────────────────────────────────────────

  private parseTeamSize(input: string): number | null {
    const lower = input.toLowerCase().trim();

    if (lower === 'auto' || lower.includes('let me decide') || lower.includes('you decide')) {
      return 3; // default auto
    }

    // Look for "team-size:N" pattern
    const sizeMatch = lower.match(/team-size:\s*(\d+)/);
    if (sizeMatch) {
      return this.clampTeamSize(parseInt(sizeMatch[1], 10));
    }

    // Look for "N agents" pattern
    const agentMatch = lower.match(/(\d+)\s*agent/);
    if (agentMatch) {
      return this.clampTeamSize(parseInt(agentMatch[1], 10));
    }

    // Plain number
    const num = parseInt(lower, 10);
    if (!isNaN(num)) {
      return this.clampTeamSize(num);
    }

    // Check for word numbers
    const wordNumbers: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    };
    for (const [word, val] of Object.entries(wordNumbers)) {
      if (lower.includes(word)) {
        return val;
      }
    }

    return null;
  }

  private clampTeamSize(n: number): number {
    return Math.max(1, Math.min(6, n));
  }

  private parseRoleSelection(input: string): string | null {
    const lower = input.toLowerCase().trim();

    // Check for "auto" or "let lead decide"
    if (lower === 'auto' || lower.includes('lead decide')) {
      // Pick a role the user hasn't selected yet
      const used = new Set(this.state.selectedRoles);
      const available = ROLE_PRESETS.filter((r) => !used.has(r.id));
      return available.length > 0 ? available[0].id : ROLE_PRESETS[0].id;
    }

    // Check for "role:backend-dev" pattern
    const roleMatch = lower.match(/role:\s*(.+)/);
    if (roleMatch) {
      const roleStr = roleMatch[1].trim();
      const role = ROLE_PRESETS.find(
        (r) =>
          r.id === roleStr ||
          r.name.toLowerCase() === roleStr,
      );
      if (role) { return role.id; }
    }

    // Number selection (1-based)
    const num = parseInt(lower, 10);
    if (!isNaN(num) && num >= 1 && num <= ROLE_PRESETS.length) {
      return ROLE_PRESETS[num - 1].id;
    }

    // Fuzzy match by name or ID
    const role = ROLE_PRESETS.find(
      (r) =>
        lower.includes(r.id) ||
        lower.includes(r.name.toLowerCase()),
    );
    if (role) { return role.id; }

    return null;
  }

  // ─── Persistence ──────────────────────────────────────────────

  private async save(): Promise<void> {
    await this.globalState.update(STATE_KEY, this.state);
  }
}
