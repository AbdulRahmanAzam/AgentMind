import * as vscode from 'vscode';
import { Logger } from './utils/logger.js';
import {
  chatHandler,
  followupProvider,
  getActiveAgentManager,
  shutdownTeam,
} from './participant/handler.js';

// ─── Module-level registry ─────────────────────────────────────────
// Shared references so other modules can access core services without
// passing them through every function call.

let outputChannel: vscode.OutputChannel | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

/** Get the shared OutputChannel (available after activation). */
export function getOutputChannel(): vscode.OutputChannel | undefined {
  return outputChannel;
}

/** Get the ExtensionContext (available after activation). */
export function getExtensionContext(): vscode.ExtensionContext | undefined {
  return extensionContext;
}

// ─── Activation ────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  extensionContext = context;

  // 1. Create the shared output channel for system logs
  outputChannel = vscode.window.createOutputChannel('AgentMind');
  context.subscriptions.push(outputChannel);
  Logger.init(outputChannel);
  Logger.info('AgentMind extension activating...');

  // 2. Register the @agentmind chat participant
  const participant = vscode.chat.createChatParticipant(
    'agentmind.lead',
    chatHandler,
  );
  participant.iconPath = vscode.Uri.joinPath(
    context.extensionUri,
    'media',
    'icon.png',
  );
  participant.followupProvider = followupProvider;
  context.subscriptions.push(participant);

  // 3. Status bar item — visible when a team is active
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.name = 'AgentMind';
  statusBarItem.text = '$(hubot) AgentMind';
  statusBarItem.tooltip = 'AgentMind — no active team';
  statusBarItem.command = 'workbench.action.chat.open';
  context.subscriptions.push(statusBarItem);
  // Hidden by default; shown when a team starts

  // 4. Register the manual stop command
  const stopCommand = vscode.commands.registerCommand(
    'agentmind.stopTeam',
    async () => {
      Logger.info('Stop team command invoked');
      const mgr = getActiveAgentManager();
      if (mgr) {
        await shutdownTeam('User invoked stop command');
        vscode.window.showInformationMessage('AgentMind: Team stopped.');
      } else {
        vscode.window.showInformationMessage('AgentMind: No active team to stop.');
      }
    },
  );
  context.subscriptions.push(stopCommand);

  Logger.info('AgentMind extension activated successfully.');
}

// ─── Deactivation ──────────────────────────────────────────────────

export async function deactivate(): Promise<void> {
  Logger.info('AgentMind extension deactivating — shutting down agents...');

  const mgr = getActiveAgentManager();
  if (mgr) {
    try {
      await shutdownTeam('Extension deactivating');
    } catch (err) {
      Logger.error(`Error during deactivation shutdown: ${err}`);
    }
  }

  statusBarItem?.dispose();
  outputChannel?.dispose();
  extensionContext = undefined;
}
