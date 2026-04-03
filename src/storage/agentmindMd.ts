import * as path from 'path';
import * as fs from 'fs/promises';
import {
  TeamConfig,
  Task,
  AGENTMIND_CONSTANTS,
} from '../types.js';
import { Logger } from '../utils/logger.js';

/**
 * Generates, writes, and reads the `AGENTMIND.md` handbook file
 * that is injected into every agent's system prompt so they
 * understand the project, the team, and their responsibilities.
 */

// ─── Read / Write ───────────────────────────────────────────────

/** Write the handbook to `.agentmind/AGENTMIND.md`. */
export async function writeAgentmindMd(
  workspaceRoot: string,
  content: string,
): Promise<void> {
  const mdPath = path.join(
    workspaceRoot,
    AGENTMIND_CONSTANTS.HANDBOOK_FILE,
  );
  await fs.writeFile(mdPath, content, 'utf-8');
  Logger.info('Handbook written: AGENTMIND.md');
}

/** Read the handbook. Returns `null` if it hasn't been generated yet. */
export async function readAgentmindMd(
  workspaceRoot: string,
): Promise<string | null> {
  const mdPath = path.join(
    workspaceRoot,
    AGENTMIND_CONSTANTS.HANDBOOK_FILE,
  );
  try {
    return await fs.readFile(mdPath, 'utf-8');
  } catch {
    return null;
  }
}

// ─── Generation ─────────────────────────────────────────────────

/**
 * Generate the full handbook markdown from the current team
 * configuration and task plan.
 */
export function generateAgentmindMd(
  teamConfig: TeamConfig,
  tasks: Task[],
  projectConventions: string,
  fileOverview: string,
): string {
  const lines: string[] = [];

  lines.push('# AGENTMIND — Agent Handbook');
  lines.push('');
  lines.push(
    '> Auto-generated. Do **not** edit manually — the Lead agent regenerates this file as needed.',
  );
  lines.push('');

  // ── Project overview
  lines.push('## 1. Project Goal');
  lines.push('');
  lines.push(teamConfig.taskDescription);
  lines.push('');

  // ── Team roster
  lines.push('## 2. Team Roster');
  lines.push('');
  lines.push('| Agent ID | Role | Icon |');
  lines.push('|----------|------|------|');
  for (const a of teamConfig.agents) {
    lines.push(`| \`${a.agentId}\` | ${a.role.name} | ${a.role.icon} |`);
  }
  lines.push('');

  // ── Task plan
  lines.push('## 3. Task Plan');
  lines.push('');
  if (tasks.length === 0) {
    lines.push('_No tasks have been created yet._');
  } else {
    for (const t of tasks) {
      const status = statusEmoji(t.status);
      const assignee = t.assignedTo ? `→ \`${t.assignedTo}\`` : '_(unassigned)_';
      lines.push(`- ${status} **${t.id}**: ${t.title} ${assignee}`);
      if (t.dependencies.length > 0) {
        lines.push(`  - _depends on_: ${t.dependencies.join(', ')}`);
      }
    }
  }
  lines.push('');

  // ── Coordination rules
  lines.push('## 4. Coordination Rules');
  lines.push('');
  lines.push('1. **Claim before working.** Call the `claim_task` tool to transition a task to `in-progress` before writing any code.');
  lines.push('2. **One task at a time.** Finish or fail your current task before claiming another.');
  lines.push('3. **Respect dependencies.** Never start a task whose `blockedBy` list is non-empty.');
  lines.push('4. **Report results.** When done, call `complete_task` with a short summary and the list of files you modified.');
  lines.push('5. **Check messages.** Before each new task, read your mailbox for instructions or blockers from the Lead or peers.');
  lines.push('6. **Ask for help.** If you are stuck, send a direct message to `lead` explaining the problem.');
  lines.push('');

  // ── File system layout
  lines.push('## 5. .agentmind/ Layout');
  lines.push('');
  lines.push('```');
  lines.push('.agentmind/');
  lines.push('  AGENTMIND.md          ← this file');
  lines.push('  tasks/                ← one JSON file per task');
  lines.push('  mailbox/              ← JSONL inboxes + broadcast.jsonl');
  lines.push('  state/                ← per-agent heartbeat JSON');
  lines.push('  locks/                ← advisory lock sentinels');
  lines.push('```');
  lines.push('');

  // ── Project conventions
  if (projectConventions) {
    lines.push('## 6. Project Conventions');
    lines.push('');
    lines.push(projectConventions);
    lines.push('');
  }

  // ── File overview
  if (fileOverview) {
    lines.push('## 7. Workspace File Overview');
    lines.push('');
    lines.push(fileOverview);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Project detection helpers ──────────────────────────────────

/**
 * Detect project conventions by reading common config files.
 * Returns a markdown snippet summarising language, framework,
 * package manager, etc.
 */
export async function detectProjectConventions(
  workspaceRoot: string,
): Promise<string> {
  const conventions: string[] = [];

  // package.json
  const pkgPath = path.join(workspaceRoot, 'package.json');
  try {
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    conventions.push(`- **Name**: ${pkg['name'] ?? 'unknown'}`);

    const deps = pkg['dependencies'] as Record<string, string> | undefined;
    const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;
    if (deps || devDeps) {
      const allDeps = { ...deps, ...devDeps };
      const frameworks = detectFrameworks(allDeps);
      if (frameworks.length > 0) {
        conventions.push(`- **Frameworks**: ${frameworks.join(', ')}`);
      }
    }

    const scripts = pkg['scripts'] as Record<string, string> | undefined;
    if (scripts) {
      const scriptList = Object.keys(scripts).slice(0, 10).join(', ');
      conventions.push(`- **Scripts**: ${scriptList}`);
    }
  } catch {
    // No package.json — skip
  }

  // tsconfig.json
  try {
    await fs.access(path.join(workspaceRoot, 'tsconfig.json'));
    conventions.push('- **Language**: TypeScript');
  } catch {
    // No tsconfig
  }

  // .eslintrc / eslint.config
  try {
    const entries = await fs.readdir(workspaceRoot);
    if (entries.some((e) => e.startsWith('.eslint') || e.startsWith('eslint.config'))) {
      conventions.push('- **Linter**: ESLint');
    }
  } catch {
    // Not critical
  }

  // pyproject.toml / requirements.txt
  try {
    await fs.access(path.join(workspaceRoot, 'pyproject.toml'));
    conventions.push('- **Language**: Python (pyproject.toml)');
  } catch {
    try {
      await fs.access(path.join(workspaceRoot, 'requirements.txt'));
      conventions.push('- **Language**: Python (requirements.txt)');
    } catch {
      // Not Python
    }
  }

  if (conventions.length === 0) {
    return '_No project conventions detected._';
  }

  return conventions.join('\n');
}

/**
 * Build a short file-tree overview (max depth 2, excluding
 * node_modules, .git, dist, .agentmind).
 */
export async function getWorkspaceFileOverview(
  workspaceRoot: string,
  maxDepth = 2,
): Promise<string> {
  const lines: string[] = ['```'];
  await walkDir(workspaceRoot, '', 0, maxDepth, lines);
  lines.push('```');
  return lines.join('\n');
}

// ─── Private helpers ────────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.agentmind',
  '__pycache__',
  '.venv',
  'venv',
]);

async function walkDir(
  root: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  lines: string[],
): Promise<void> {
  if (depth > maxDepth) {
    return;
  }

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });

    // Sort: directories first, then files
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) {
        return -1;
      }
      if (!a.isDirectory() && b.isDirectory()) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const indent = '  '.repeat(depth);

      if (entry.isDirectory()) {
        lines.push(`${indent}${prefix}${entry.name}/`);
        await walkDir(
          path.join(root, entry.name),
          '',
          depth + 1,
          maxDepth,
          lines,
        );
      } else {
        lines.push(`${indent}${prefix}${entry.name}`);
      }
    }
  } catch {
    // Permission error or similar — skip silently
  }
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'completed':
      return '✅';
    case 'in-progress':
      return '🔄';
    case 'blocked':
      return '🚫';
    case 'failed':
      return '❌';
    case 'claimed':
      return '📋';
    default:
      return '⬜';
  }
}

function detectFrameworks(deps: Record<string, string>): string[] {
  const frameworks: string[] = [];
  const checks: [string, string][] = [
    ['react', 'React'],
    ['next', 'Next.js'],
    ['vue', 'Vue'],
    ['nuxt', 'Nuxt'],
    ['svelte', 'Svelte'],
    ['@angular/core', 'Angular'],
    ['express', 'Express'],
    ['fastify', 'Fastify'],
    ['hono', 'Hono'],
    ['vite', 'Vite'],
    ['webpack', 'Webpack'],
    ['tailwindcss', 'Tailwind CSS'],
    ['prisma', 'Prisma'],
    ['drizzle-orm', 'Drizzle'],
  ];

  for (const [pkg, name] of checks) {
    if (pkg in deps) {
      frameworks.push(name);
    }
  }

  return frameworks;
}
