import * as vscode from 'vscode';
import { TerminalFormatter } from './formatter.js';

/**
 * A VS Code Pseudoterminal that provides a visible terminal tab
 * for a single agent. All agent activity (thinking, tool calls,
 * messages, task updates) is rendered here in real time.
 */
export class AgentPseudoterminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();

  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  private readonly agentId: string;
  private readonly roleName: string;
  private readonly icon: string;
  private pauseFlag = false;

  constructor(agentId: string, roleName: string, icon: string) {
    this.agentId = agentId;
    this.roleName = roleName;
    this.icon = icon;
  }

  // ─── Pseudoterminal interface ─────────────────────────────────

  open(_initialDimensions?: vscode.TerminalDimensions): void {
    this.writeRaw(
      TerminalFormatter.agentHeader(this.agentId, this.roleName, this.icon),
    );
    this.writeLine(
      TerminalFormatter.info(`Agent ${this.agentId} initializing...`),
    );
    this.writeLine(TerminalFormatter.separator());
  }

  close(): void {
    this.closeEmitter.fire(undefined);
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  handleInput(data: string): void {
    // Ctrl+C
    if (data === '\x03') {
      this.pauseFlag = true;
      this.writeLine(
        TerminalFormatter.info('Pause requested — agent will pause after current operation.'),
      );
    }
    // All other input is ignored (agents are autonomous)
  }

  // ─── Write helpers ────────────────────────────────────────────

  /** Write a line with timestamp + \\r\\n. */
  writeLine(text: string): void {
    this.writeRaw(`${TerminalFormatter.timestamp()} ${text}\r\n`);
  }

  writeThinking(text: string): void {
    this.writeLine(TerminalFormatter.thinking(text));
  }

  writeToolCall(toolName: string, input: string): void {
    this.writeLine(TerminalFormatter.toolCall(toolName, input));
  }

  writeToolResult(success: boolean, output: string): void {
    this.writeLine(TerminalFormatter.toolResult(success, output));
  }

  writeMessage(from: string, content: string): void {
    this.writeLine(TerminalFormatter.message(from, content));
  }

  writeTaskUpdate(taskId: string, status: string): void {
    this.writeLine(TerminalFormatter.taskUpdate(taskId, status));
  }

  writeError(text: string): void {
    this.writeLine(TerminalFormatter.error(text));
  }

  writeSuccess(text: string): void {
    this.writeLine(TerminalFormatter.success(text));
  }

  writeInfo(text: string): void {
    this.writeLine(TerminalFormatter.info(text));
  }

  writeProgress(completed: number, total: number, label: string): void {
    this.writeLine(TerminalFormatter.progress(completed, total, label));
  }

  /** Check (and consume) the pause flag set by Ctrl+C. */
  isPauseRequested(): boolean {
    if (this.pauseFlag) {
      this.pauseFlag = false;
      return true;
    }
    return false;
  }

  /** Write raw text (no timestamp, no newline). */
  private writeRaw(text: string): void {
    try {
      this.writeEmitter.fire(text);
    } catch {
      // Terminal may already be disposed
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a VS Code terminal backed by an AgentPseudoterminal.
 * Returns both the terminal (for `.show()`) and the pty (for writing).
 */
export function createAgentTerminal(
  agentId: string,
  roleName: string,
  icon: string,
): { terminal: vscode.Terminal; pty: AgentPseudoterminal } {
  const pty = new AgentPseudoterminal(agentId, roleName, icon);
  const terminal = vscode.window.createTerminal({
    name: `${icon} AgentMind: ${roleName}`,
    pty,
  });
  return { terminal, pty };
}
