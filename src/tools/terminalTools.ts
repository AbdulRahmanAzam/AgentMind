import * as path from 'path';
import { exec } from 'child_process';
import { ToolCallResult } from '../types.js';
import { Logger } from '../utils/logger.js';

/** Maximum execution time for a single command (ms). */
const COMMAND_TIMEOUT_MS = 60_000;

/** Maximum output buffer size (bytes). */
const MAX_BUFFER = 1024 * 1024; // 1 MB

/**
 * Patterns that indicate a destructive or dangerous command.
 * Each pattern is tested case-insensitively against the full command string.
 */
const BLOCKED_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /rm\s+-rf\s+\/(?!\S*\.agentmind)/i, reason: 'Recursive delete from root is blocked' },
  { pattern: /del\s+\/s\s+\/q\s+[A-Z]:/i, reason: 'Recursive delete on drive root is blocked' },
  { pattern: /format\s+[A-Z]:/i, reason: 'Disk format commands are blocked' },
  { pattern: /mkfs\b/i, reason: 'Filesystem creation commands are blocked' },
  { pattern: /dd\s+if=/i, reason: 'Raw disk write (dd) is blocked' },
  { pattern: />\s*\/dev\/sd[a-z]/i, reason: 'Direct device write is blocked' },
  { pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/i, reason: 'Fork bombs are blocked' },
  { pattern: /shutdown\s/i, reason: 'System shutdown commands are blocked' },
  { pattern: /reboot\b/i, reason: 'System reboot commands are blocked' },
  { pattern: /curl\s.*\|\s*(ba)?sh/i, reason: 'Piping remote scripts to shell is blocked' },
  { pattern: /wget\s.*\|\s*(ba)?sh/i, reason: 'Piping remote scripts to shell is blocked' },
];

/**
 * Handlers for shell command execution tools.
 *
 * SECURITY: Dangerous commands are blocked before execution.
 */
export class TerminalToolHandlers {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Execute a shell command and return its output.
   */
  async runCommand(input: {
    command: string;
    cwd?: string;
  }): Promise<ToolCallResult> {
    // Safety check
    const safety = this.isCommandSafe(input.command);
    if (!safety.safe) {
      Logger.warn(
        `TerminalTools: BLOCKED command "${input.command}" — ${safety.reason}`,
      );
      return {
        success: false,
        output: '',
        error: `Command blocked: ${safety.reason}`,
        filesModified: [],
      };
    }

    // Resolve working directory
    let cwd = this.workspaceRoot;
    if (input.cwd) {
      const resolved = path.resolve(this.workspaceRoot, input.cwd);
      const root = path.resolve(this.workspaceRoot);
      if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        return {
          success: false,
          output: '',
          error: `Working directory "${input.cwd}" resolves outside workspace root`,
          filesModified: [],
        };
      }
      cwd = resolved;
    }

    Logger.debug(
      `TerminalTools: exec "${input.command}" in ${path.relative(this.workspaceRoot, cwd) || '.'}`,
    );

    return new Promise<ToolCallResult>((resolve) => {
      const child = exec(
        input.command,
        {
          cwd,
          timeout: COMMAND_TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
          env: { ...process.env },
        },
        (error, stdout, stderr) => {
          const output = [stdout, stderr].filter(Boolean).join('\n').trim();

          if (error) {
            // Check if it was a timeout
            if (error.killed) {
              resolve({
                success: false,
                output: output || '',
                error: `Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s`,
                filesModified: [],
              });
              return;
            }

            resolve({
              success: false,
              output,
              error: `Exit code ${error.code ?? 'unknown'}: ${error.message}`,
              filesModified: [],
            });
            return;
          }

          resolve({
            success: true,
            output: output || '(no output)',
            error: null,
            filesModified: [],
          });
        },
      );

      // Handle process-level errors
      child.on('error', (err) => {
        resolve({
          success: false,
          output: '',
          error: `Process error: ${err.message}`,
          filesModified: [],
        });
      });
    });
  }

  /**
   * Check a command string against the blocklist.
   *
   * @returns `{ safe: true }` if the command is allowed,
   *          `{ safe: false, reason: string }` if blocked.
   */
  isCommandSafe(command: string): { safe: boolean; reason?: string } {
    for (const { pattern, reason } of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return { safe: false, reason };
      }
    }
    return { safe: true };
  }
}
