import * as vscode from 'vscode';

/**
 * Centralized logger for the AgentMind extension.
 * Wraps a VS Code OutputChannel and provides structured, timestamped logging.
 *
 * Initialize once via `Logger.init()` in the extension's `activate()`,
 * then import and call static methods from any module.
 */
export class Logger {
  private static channel: vscode.OutputChannel | null = null;

  /** Initialize the logger with a VS Code OutputChannel. */
  static init(channel: vscode.OutputChannel): void {
    Logger.channel = channel;
  }

  /** Log an informational message. */
  static info(message: string): void {
    Logger.write('INFO', message);
  }

  /** Log a warning message. */
  static warn(message: string): void {
    Logger.write('WARN', message);
  }

  /** Log an error message. */
  static error(message: string): void {
    Logger.write('ERROR', message);
  }

  /** Log a debug-level message. */
  static debug(message: string): void {
    Logger.write('DEBUG', message);
  }

  /**
   * Log a message prefixed with an agent ID.
   * @param agentId - The agent producing this log entry.
   * @param message - The log content.
   */
  static agent(agentId: string, message: string): void {
    Logger.write('AGENT', `[${agentId}] ${message}`);
  }

  /** Format and write a line to the output channel. */
  private static write(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}`;
    if (Logger.channel) {
      Logger.channel.appendLine(line);
    }
    // Also log to console for Extension Development Host debugging
    if (level === 'ERROR') {
      console.error(line);
    }
  }
}
