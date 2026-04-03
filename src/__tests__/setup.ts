import { vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as crypto from 'crypto';

// ─── Mock the vscode module ────────────────────────────────────

vi.mock('vscode', () => {
  const EventEmitter = class {
    private listeners: Function[] = [];
    event = (listener: Function) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire = (data: unknown) => {
      for (const l of this.listeners) l(data);
    };
    dispose = () => {
      this.listeners = [];
    };
  };

  return {
    window: {
      createTerminal: vi.fn(() => ({
        show: vi.fn(),
        dispose: vi.fn(),
        name: 'test',
      })),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
      createStatusBarItem: vi.fn(() => ({
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        text: '',
        tooltip: '',
        command: '',
      })),
      showInformationMessage: vi.fn(),
    },
    workspace: {
      workspaceFolders: [],
      findFiles: vi.fn(async () => []),
      openTextDocument: vi.fn(),
      fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
      },
    },
    languages: {
      getDiagnostics: vi.fn(() => []),
    },
    chat: {
      createChatParticipant: vi.fn(() => ({
        iconPath: undefined,
        followupProvider: undefined,
        dispose: vi.fn(),
      })),
    },
    lm: {
      selectChatModels: vi.fn(async () => []),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
      executeCommand: vi.fn(),
    },
    Uri: {
      file: (p: string) => ({ fsPath: p, path: p }),
      joinPath: (...segments: unknown[]) => ({
        fsPath: (segments as { fsPath?: string }[]).map(s =>
          typeof s === 'string' ? s : (s as { fsPath?: string }).fsPath ?? ''
        ).join('/'),
      }),
    },
    EventEmitter,
    CancellationTokenSource: class {
      token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      };
      cancel = vi.fn(() => {
        this.token.isCancellationRequested = true;
      });
      dispose = vi.fn();
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    LanguageModelChatMessage: {
      User: vi.fn((content: unknown) => ({ role: 'user', content })),
      Assistant: vi.fn((content: unknown) => ({ role: 'assistant', content })),
    },
    LanguageModelTextPart: class {
      constructor(public value: string) {}
    },
    LanguageModelToolCallPart: class {
      constructor(
        public callId: string,
        public name: string,
        public input: unknown,
      ) {}
    },
    LanguageModelToolResultPart: class {
      constructor(public callId: string, public content: unknown[]) {}
    },
    LanguageModelError: class extends Error {
      constructor(message: string, public code?: string) {
        super(message);
      }
    },
  };
});

// ─── Temp workspace helpers ─────────────────────────────────────

/**
 * Create a temporary workspace directory with the `.agentmind/` structure.
 * Returns the absolute path to the temp root.
 */
export async function createTempWorkspace(): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tmpDir = path.join(os.tmpdir(), `agentmind-test-${suffix}`);

  await fs.mkdir(path.join(tmpDir, '.agentmind', 'tasks'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.agentmind', 'mailbox'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.agentmind', 'state'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, '.agentmind', 'locks'), { recursive: true });

  return tmpDir;
}

/**
 * Remove a temporary workspace directory and all its contents.
 */
export async function cleanTempWorkspace(tmpDir: string): Promise<void> {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}
