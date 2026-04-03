import * as vscode from 'vscode';

/**
 * All tool definitions that agents can use, grouped by category.
 *
 * Each definition follows the `vscode.LanguageModelChatTool` shape
 * (name, description, inputSchema). The actual handler implementations
 * live in `src/tools/`.
 */

// ─── File tools ─────────────────────────────────────────────────

const readFile: vscode.LanguageModelChatTool = {
  name: 'readFile',
  description:
    'Read the contents of a file in the workspace. Supports optional line range. Returns the file text.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Workspace-relative file path (e.g. "src/index.ts").',
      },
      startLine: {
        type: 'number',
        description: 'Optional 1-based start line.',
      },
      endLine: {
        type: 'number',
        description: 'Optional 1-based end line (inclusive).',
      },
    },
    required: ['path'],
  },
};

const writeFile: vscode.LanguageModelChatTool = {
  name: 'writeFile',
  description:
    'Create or overwrite a file with the given content. Parent directories are created automatically.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative file path.',
      },
      content: {
        type: 'string',
        description: 'The full file content to write.',
      },
    },
    required: ['path', 'content'],
  },
};

const editFile: vscode.LanguageModelChatTool = {
  name: 'editFile',
  description:
    'Replace the first occurrence of an exact string in a file. Use this for targeted edits instead of rewriting the whole file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative file path.',
      },
      oldString: {
        type: 'string',
        description: 'The exact text to find and replace (first occurrence only).',
      },
      newString: {
        type: 'string',
        description: 'The replacement text.',
      },
    },
    required: ['path', 'oldString', 'newString'],
  },
};

const searchFiles: vscode.LanguageModelChatTool = {
  name: 'searchFiles',
  description:
    'Find files matching a glob pattern (e.g. "**/*.ts", "src/**/test*"). Excludes node_modules, .git, dist.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match file paths.',
      },
    },
    required: ['pattern'],
  },
};

const searchText: vscode.LanguageModelChatTool = {
  name: 'searchText',
  description:
    'Search for a text string across workspace files. Returns matching file paths, line numbers, and content snippets.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The text string to search for.',
      },
      includePattern: {
        type: 'string',
        description:
          'Optional glob pattern to limit search scope (e.g. "**/*.ts").',
      },
    },
    required: ['query'],
  },
};

const listDirectory: vscode.LanguageModelChatTool = {
  name: 'listDirectory',
  description:
    'List the contents of a directory. Returns file and folder names (folders end with "/").',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Workspace-relative directory path. Use "." for workspace root.',
      },
    },
    required: ['path'],
  },
};

// ─── Terminal tools ─────────────────────────────────────────────

const runCommand: vscode.LanguageModelChatTool = {
  name: 'runCommand',
  description:
    'Execute a shell command and return its output. Use for builds, tests, installs, git operations, etc. 60-second timeout.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute.',
      },
      cwd: {
        type: 'string',
        description:
          'Optional working directory relative to workspace root.',
      },
    },
    required: ['command'],
  },
};

// ─── Communication tools ────────────────────────────────────────

const sendMessage: vscode.LanguageModelChatTool = {
  name: 'sendMessage',
  description:
    'Send a direct message to another agent. Use for coordination, questions, or reporting issues.',
  inputSchema: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description:
          'The recipient agent ID (e.g. "backend-dev-a1b2c3d4" or "lead").',
      },
      content: {
        type: 'string',
        description: 'The message text.',
      },
    },
    required: ['to', 'content'],
  },
};

const broadcastMessage: vscode.LanguageModelChatTool = {
  name: 'broadcastMessage',
  description:
    'Send a message to ALL agents on the team. Use sparingly — only for information relevant to everyone.',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The broadcast message text.',
      },
    },
    required: ['content'],
  },
};

const checkInbox: vscode.LanguageModelChatTool = {
  name: 'checkInbox',
  description:
    'Check for unread messages in your inbox. Returns formatted messages or "No unread messages".',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const getTaskList: vscode.LanguageModelChatTool = {
  name: 'getTaskList',
  description:
    'View all tasks and their current statuses. Shows task ID, status, assignee, title, and dependency info.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const updateTaskStatus: vscode.LanguageModelChatTool = {
  name: 'updateTaskStatus',
  description:
    'Update a task status (e.g. to "completed" or "failed"). Include a result summary and list of files modified.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The task ID to update.',
      },
      status: {
        type: 'string',
        description:
          'New status: "completed", "failed", "blocked", or "pending".',
      },
      result: {
        type: 'string',
        description: 'Summary of work done or error description.',
      },
      filesModified: {
        type: 'array',
        items: { type: 'string' },
        description: 'Workspace-relative paths of files created/modified.',
      },
    },
    required: ['taskId', 'status'],
  },
};

const claimTask: vscode.LanguageModelChatTool = {
  name: 'claimTask',
  description:
    'Claim an unclaimed task to start working on it. Prevents other agents from picking it up. Fails if already claimed.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The task ID to claim.',
      },
    },
    required: ['taskId'],
  },
};

// ─── Code analysis tools ────────────────────────────────────────

const getDiagnostics: vscode.LanguageModelChatTool = {
  name: 'getDiagnostics',
  description:
    'Get compile/lint errors and warnings for a specific file. Shows line number, severity, and message.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative file path to check.',
      },
    },
    required: ['path'],
  },
};

const getSymbolInfo: vscode.LanguageModelChatTool = {
  name: 'getSymbolInfo',
  description:
    'Find the definition and all references of a code symbol (function, class, variable, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: {
        type: 'string',
        description: 'The symbol name to look up.',
      },
      path: {
        type: 'string',
        description:
          'Workspace-relative file path where the symbol appears.',
      },
    },
    required: ['symbol', 'path'],
  },
};

// ─── Lead-only tools ────────────────────────────────────────────

const createTask: vscode.LanguageModelChatTool = {
  name: 'createTask',
  description:
    'Create a new task in the shared task list. Only the Team Lead should use this tool.',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short, descriptive task title.',
      },
      description: {
        type: 'string',
        description:
          'Detailed task description with acceptance criteria. Be specific so the assigned agent can work independently.',
      },
      assignedTo: {
        type: 'string',
        description:
          'Optional agent ID to assign the task to. Leave empty for any agent to claim.',
      },
      priority: {
        type: 'string',
        description:
          'Task priority: "critical", "high", "medium", or "low". Defaults to "medium".',
      },
      dependencies: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional array of task IDs that must complete before this task can start.',
      },
    },
    required: ['title', 'description'],
  },
};

const assignTask: vscode.LanguageModelChatTool = {
  name: 'assignTask',
  description:
    'Assign or reassign a task to an agent. Sends a notification to the assigned agent.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The task ID to assign.',
      },
      agentId: {
        type: 'string',
        description: 'The agent ID to assign the task to.',
      },
    },
    required: ['taskId', 'agentId'],
  },
};

const shutdownAgent: vscode.LanguageModelChatTool = {
  name: 'shutdownAgent',
  description:
    'Request an agent to gracefully shut down. Use when the team is done or an agent is misbehaving.',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'The agent ID to shut down.',
      },
      reason: {
        type: 'string',
        description: 'Reason for the shutdown.',
      },
    },
    required: ['agentId', 'reason'],
  },
};

// ─── Grouped exports ────────────────────────────────────────────

/** All tool definitions, grouped by category. */
export const AGENT_TOOLS = {
  file: [readFile, writeFile, editFile, searchFiles, searchText, listDirectory],
  terminal: [runCommand],
  communication: [
    sendMessage,
    broadcastMessage,
    checkInbox,
    getTaskList,
    updateTaskStatus,
    claimTask,
  ],
  codeAnalysis: [getDiagnostics, getSymbolInfo],
  leadOnly: [createTask, assignTask, shutdownAgent],
} as const;

/** Flat array of every tool name string. */
export const ALL_TOOL_NAMES: string[] = [
  ...AGENT_TOOLS.file,
  ...AGENT_TOOLS.terminal,
  ...AGENT_TOOLS.communication,
  ...AGENT_TOOLS.codeAnalysis,
  ...AGENT_TOOLS.leadOnly,
].map((t) => t.name);

/** Read-only file tool names (no write/edit). */
const READ_ONLY_FILE_TOOLS = new Set(['readFile', 'searchFiles', 'searchText', 'listDirectory']);

/**
 * Return the subset of tools available to a specific role.
 *
 * - The Lead gets ALL tools.
 * - Security Reviewer and Code Reviewer get read-only file tools + communication + code analysis.
 * - All other roles get file + terminal + communication + code analysis.
 */
export function getToolsForRole(
  roleId: string,
  isLead: boolean,
): vscode.LanguageModelChatTool[] {
  if (isLead) {
    return [
      ...AGENT_TOOLS.file,
      ...AGENT_TOOLS.terminal,
      ...AGENT_TOOLS.communication,
      ...AGENT_TOOLS.codeAnalysis,
      ...AGENT_TOOLS.leadOnly,
    ];
  }

  const isReadOnly = roleId === 'security-reviewer' || roleId === 'code-reviewer';

  const fileTools = isReadOnly
    ? AGENT_TOOLS.file.filter((t) => READ_ONLY_FILE_TOOLS.has(t.name))
    : [...AGENT_TOOLS.file];

  const terminalTools = isReadOnly
    ? [...AGENT_TOOLS.terminal] // read-only roles can still run commands (e.g. npm audit)
    : [...AGENT_TOOLS.terminal];

  const commTools = [...AGENT_TOOLS.communication];
  const codeTools = [...AGENT_TOOLS.codeAnalysis];

  // Doc writer doesn't get terminal tools by default
  if (roleId === 'doc-writer') {
    return [...fileTools, ...commTools, ...codeTools];
  }

  return [...fileTools, ...terminalTools, ...commTools, ...codeTools];
}
