import * as path from 'path';
import * as vscode from 'vscode';
import { ToolCallResult } from '../types.js';
import { Logger } from '../utils/logger.js';

/**
 * Tool handlers for code analysis using VS Code language services.
 */
export class CodeToolHandlers {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Get compile/lint diagnostics for a specific file.
   */
  async getDiagnostics(input: { path: string }): Promise<ToolCallResult> {
    try {
      const absPath = path.resolve(this.workspaceRoot, input.path);
      const uri = vscode.Uri.file(absPath);
      const diagnostics = vscode.languages.getDiagnostics(uri);

      if (diagnostics.length === 0) {
        return {
          success: true,
          output: `No diagnostics found for ${input.path} — file is clean.`,
          error: null,
          filesModified: [],
        };
      }

      // Sort: errors first, then warnings, then info, then hints
      const severityOrder: Record<number, number> = {
        [vscode.DiagnosticSeverity.Error]: 0,
        [vscode.DiagnosticSeverity.Warning]: 1,
        [vscode.DiagnosticSeverity.Information]: 2,
        [vscode.DiagnosticSeverity.Hint]: 3,
      };

      const sorted = [...diagnostics].sort(
        (a, b) =>
          (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
      );

      const severityLabel = (s: vscode.DiagnosticSeverity): string => {
        switch (s) {
          case vscode.DiagnosticSeverity.Error:
            return 'ERROR';
          case vscode.DiagnosticSeverity.Warning:
            return 'WARNING';
          case vscode.DiagnosticSeverity.Information:
            return 'INFO';
          case vscode.DiagnosticSeverity.Hint:
            return 'HINT';
          default:
            return 'UNKNOWN';
        }
      };

      const lines = sorted.map((d) => {
        const line = d.range.start.line + 1;
        const sev = severityLabel(d.severity);
        const source = d.source ? ` (${d.source})` : '';
        return `Line ${line}: [${sev}] ${d.message}${source}`;
      });

      const errorCount = sorted.filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Error,
      ).length;
      const warnCount = sorted.filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Warning,
      ).length;

      const summary = `${input.path}: ${errorCount} error(s), ${warnCount} warning(s), ${diagnostics.length} total`;

      return {
        success: true,
        output: `${summary}\n\n${lines.join('\n')}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, `getDiagnostics: ${input.path}`);
    }
  }

  /**
   * Find the definition and references of a code symbol.
   */
  async getSymbolInfo(input: {
    symbol: string;
    path: string;
  }): Promise<ToolCallResult> {
    try {
      const absPath = path.resolve(this.workspaceRoot, input.path);
      const uri = vscode.Uri.file(absPath);

      // Read the file to find the symbol position
      let doc: vscode.TextDocument;
      try {
        doc = await vscode.workspace.openTextDocument(uri);
      } catch {
        return {
          success: false,
          output: '',
          error: `Could not open file: ${input.path}`,
          filesModified: [],
        };
      }

      const text = doc.getText();
      const symbolIdx = text.indexOf(input.symbol);

      if (symbolIdx === -1) {
        return {
          success: false,
          output: '',
          error: `Symbol "${input.symbol}" not found in ${input.path}`,
          filesModified: [],
        };
      }

      const position = doc.positionAt(symbolIdx);
      const sections: string[] = [];

      // Definitions
      try {
        const definitions =
          await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            uri,
            position,
          );

        if (definitions && definitions.length > 0) {
          const defs = definitions.map((d) => {
            const relPath = path
              .relative(this.workspaceRoot, d.uri.fsPath)
              .replace(/\\/g, '/');
            return `  ${relPath}:${d.range.start.line + 1}`;
          });
          sections.push(`Definitions:\n${defs.join('\n')}`);
        } else {
          sections.push('Definitions: none found');
        }
      } catch {
        sections.push('Definitions: provider unavailable');
      }

      // References
      try {
        const references =
          await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            uri,
            position,
          );

        if (references && references.length > 0) {
          const refs = references.slice(0, 30).map((r) => {
            const relPath = path
              .relative(this.workspaceRoot, r.uri.fsPath)
              .replace(/\\/g, '/');
            return `  ${relPath}:${r.range.start.line + 1}`;
          });
          const suffix =
            references.length > 30
              ? `\n  ... and ${references.length - 30} more`
              : '';
          sections.push(
            `References (${references.length}):\n${refs.join('\n')}${suffix}`,
          );
        } else {
          sections.push('References: none found');
        }
      } catch {
        sections.push('References: provider unavailable');
      }

      return {
        success: true,
        output: `Symbol: "${input.symbol}" in ${input.path}\n\n${sections.join('\n\n')}`,
        error: null,
        filesModified: [],
      };
    } catch (err) {
      return this.errorResult(err, `getSymbolInfo: ${input.symbol}`);
    }
  }

  /** Convert an error to a ToolCallResult. */
  private errorResult(err: unknown, context: string): ToolCallResult {
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`CodeTools: ${context} — ${message}`);
    return {
      success: false,
      output: '',
      error: message,
      filesModified: [],
    };
  }
}
