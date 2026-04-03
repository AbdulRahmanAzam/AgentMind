import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { ToolCallResult } from '../types.js';
import { Logger } from '../utils/logger.js';

/**
 * Handlers for all file-operation tools that agents can invoke.
 *
 * SECURITY: Every path is validated to be within the workspace root
 * before any read or write operation.
 */
export class FileToolHandlers {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  // ─── Tools ────────────────────────────────────────────────────

  async readFile(input: {
    path: string;
    startLine?: number;
    endLine?: number;
  }): Promise<ToolCallResult> {
    try {
      const absPath = this.validatePath(input.path);
      const content = await fs.readFile(absPath, 'utf-8');

      if (input.startLine || input.endLine) {
        const lines = content.split('\n');
        const start = Math.max((input.startLine ?? 1) - 1, 0);
        const end = Math.min(input.endLine ?? lines.length, lines.length);
        const slice = lines.slice(start, end).join('\n');
        return {
          success: true,
          output: `File: ${input.path} (lines ${start + 1}-${end})\n\n${slice}`,
          error: null,
          filesModified: [],
        };
      }

      return {
        success: true,
        output: `File: ${input.path}\n\n${content}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, `readFile: ${input.path}`);
    }
  }

  async writeFile(input: {
    path: string;
    content: string;
  }): Promise<ToolCallResult> {
    try {
      const absPath = this.validatePath(input.path);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, input.content, 'utf-8');

      Logger.debug(`FileTools: wrote ${input.path}`);
      return {
        success: true,
        output: `File written: ${input.path} (${input.content.length} characters)`,
        error: null,
        filesModified: [input.path],
      };
    } catch (err) {
      return this.errorResult(err, `writeFile: ${input.path}`);
    }
  }

  async editFile(input: {
    path: string;
    oldString: string;
    newString: string;
  }): Promise<ToolCallResult> {
    try {
      const absPath = this.validatePath(input.path);
      const content = await fs.readFile(absPath, 'utf-8');

      const idx = content.indexOf(input.oldString);
      if (idx === -1) {
        return {
          success: false,
          output: '',
          error: `String not found in ${input.path}. The oldString must match exactly (including whitespace and indentation).`,
          filesModified: [],
        };
      }

      const updated =
        content.slice(0, idx) +
        input.newString +
        content.slice(idx + input.oldString.length);

      await fs.writeFile(absPath, updated, 'utf-8');

      // Show a context window around the edit
      const lines = updated.split('\n');
      const editLine = content.slice(0, idx).split('\n').length;
      const contextStart = Math.max(editLine - 3, 0);
      const contextEnd = Math.min(
        editLine + input.newString.split('\n').length + 2,
        lines.length,
      );
      const context = lines.slice(contextStart, contextEnd).join('\n');

      Logger.debug(`FileTools: edited ${input.path} at line ${editLine}`);
      return {
        success: true,
        output: `File edited: ${input.path} (around line ${editLine})\n\n${context}`,
        error: null,
        filesModified: [input.path],
      };
    } catch (err) {
      return this.errorResult(err, `editFile: ${input.path}`);
    }
  }

  async searchFiles(input: {
    pattern: string;
  }): Promise<ToolCallResult> {
    try {
      const exclude = '{node_modules,.git,.agentmind,dist}/**';
      const uris = await vscode.workspace.findFiles(input.pattern, exclude, 200);

      if (uris.length === 0) {
        return {
          success: true,
          output: `No files found matching "${input.pattern}"`,
          error: null,
          filesModified: [],
        };
      }

      const relativePaths = uris.map((u) =>
        path.relative(this.workspaceRoot, u.fsPath).replace(/\\/g, '/'),
      );

      return {
        success: true,
        output: `Found ${relativePaths.length} file(s):\n${relativePaths.join('\n')}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, `searchFiles: ${input.pattern}`);
    }
  }

  async searchText(input: {
    query: string;
    includePattern?: string;
  }): Promise<ToolCallResult> {
    try {
      const exclude = '{node_modules,.git,.agentmind,dist}/**';
      const pattern = input.includePattern ?? '**/*';
      const uris = await vscode.workspace.findFiles(pattern, exclude, 500);

      const matches: string[] = [];
      const MAX_MATCHES = 50;

      for (const uri of uris) {
        if (matches.length >= MAX_MATCHES) {
          break;
        }

        try {
          const content = await fs.readFile(uri.fsPath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= MAX_MATCHES) {
              break;
            }

            if (lines[i].includes(input.query)) {
              const relPath = path
                .relative(this.workspaceRoot, uri.fsPath)
                .replace(/\\/g, '/');
              const snippet = lines[i].trim().slice(0, 120);
              matches.push(`${relPath}:${i + 1}: ${snippet}`);
            }
          }
        } catch {
          // Skip binary files or unreadable files
        }
      }

      if (matches.length === 0) {
        return {
          success: true,
          output: `No matches found for "${input.query}"`,
          error: null,
          filesModified: [],
        };
      }

      const header =
        matches.length >= MAX_MATCHES
          ? `First ${MAX_MATCHES} matches for "${input.query}":`
          : `Found ${matches.length} match(es) for "${input.query}":`;

      return {
        success: true,
        output: `${header}\n${matches.join('\n')}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, `searchText: ${input.query}`);
    }
  }

  async listDirectory(input: { path: string }): Promise<ToolCallResult> {
    try {
      const absPath = this.validatePath(input.path);
      const entries = await fs.readdir(absPath, { withFileTypes: true });

      const listing = entries
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) {
            return -1;
          }
          if (!a.isDirectory() && b.isDirectory()) {
            return 1;
          }
          return a.name.localeCompare(b.name);
        })
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));

      return {
        success: true,
        output: `Directory: ${input.path}\n\n${listing.join('\n')}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, `listDirectory: ${input.path}`);
    }
  }

  // ─── Path security ────────────────────────────────────────────

  /**
   * Validate that a workspace-relative path resolves to a location
   * within the workspace root. Prevents path traversal attacks.
   *
   * @param relativePath - The user-supplied relative path.
   * @returns The resolved absolute path.
   * @throws If the path escapes the workspace root.
   */
  private validatePath(relativePath: string): string {
    // Normalize the input: remove leading slashes, normalize separators
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');

    // Reject obvious traversal patterns
    if (normalized.includes('..')) {
      throw new Error(
        `Path traversal rejected: "${relativePath}" contains ".."`,
      );
    }

    const absPath = path.resolve(this.workspaceRoot, normalized);
    const resolvedRoot = path.resolve(this.workspaceRoot);

    if (!absPath.startsWith(resolvedRoot + path.sep) && absPath !== resolvedRoot) {
      throw new Error(
        `Path traversal rejected: "${relativePath}" resolves outside workspace`,
      );
    }

    return absPath;
  }

  /** Convert an error to a ToolCallResult. */
  private errorResult(err: unknown, context: string): ToolCallResult {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`FileTools: ${context} — ${message}`);
    return {
      success: false,
      output: '',
      error: message,
      filesModified: [],
    };
  }
}
