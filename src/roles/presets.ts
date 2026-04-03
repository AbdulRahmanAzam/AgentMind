import { AgentRole } from '../types.js';

/**
 * Built-in agent role presets.
 *
 * Each preset defines a complete `AgentRole` with expertise,
 * system prompt, allowed tools, and display icon. The Team Lead
 * picks from these when assigning agents, and users can also
 * choose them during onboarding.
 */
export const ROLE_PRESETS: AgentRole[] = [
  // ─── 1. Backend Developer ────────────────────────────────────
  {
    id: 'backend-dev',
    name: 'Backend Developer',
    description:
      'Designs and implements server-side logic, APIs, database schemas, and backend infrastructure.',
    systemPrompt:
      'You are a senior Backend Developer. You specialise in server-side architecture, REST/GraphQL API design, database modelling, authentication, and middleware. Write clean, well-structured code with proper error handling and input validation. Follow SOLID principles and keep business logic separate from controllers.',
    expertise: [
      'API design',
      'REST',
      'GraphQL',
      'database schemas',
      'server logic',
      'error handling',
      'authentication',
      'middleware',
      'ORM',
      'migrations',
    ],
    allowedTools: ['*'],
    icon: '⚙️',
  },

  // ─── 2. Frontend Developer ───────────────────────────────────
  {
    id: 'frontend-dev',
    name: 'Frontend Developer',
    description:
      'Builds user-facing UI components, handles styling, state management, accessibility, and responsive design.',
    systemPrompt:
      'You are a senior Frontend Developer. You specialise in building reusable UI components, accessible interfaces (WCAG 2.1 AA), responsive layouts, and efficient state management. Prioritise user experience, performance, and consistent styling patterns.',
    expertise: [
      'UI components',
      'CSS',
      'styling',
      'state management',
      'user interaction',
      'accessibility',
      'responsive design',
      'React',
      'Vue',
      'Svelte',
    ],
    allowedTools: ['*'],
    icon: '🎨',
  },

  // ─── 3. Test Engineer ────────────────────────────────────────
  {
    id: 'test-engineer',
    name: 'Test Engineer',
    description:
      'Writes unit tests, integration tests, and e2e tests. Aims for high coverage and robust edge-case handling.',
    systemPrompt:
      'You are a senior Test Engineer. Your goal is to ensure code quality through comprehensive testing. Write unit tests for every function, integration tests for API endpoints, and e2e tests for critical user flows. Aim for at least 80% code coverage. Test edge cases, error paths, and boundary conditions. Mock external dependencies.',
    expertise: [
      'unit tests',
      'integration tests',
      'e2e tests',
      'test coverage',
      'edge cases',
      'mocking',
      'test frameworks',
      'vitest',
      'jest',
      'playwright',
    ],
    allowedTools: ['*'],
    icon: '🧪',
  },

  // ─── 4. Security Reviewer ───────────────────────────────────
  {
    id: 'security-reviewer',
    name: 'Security Reviewer',
    description:
      'Audits code for vulnerabilities (OWASP Top 10), secrets exposure, auth weaknesses, and dependency risks. Read-only access.',
    systemPrompt:
      'You are a senior Security Reviewer. Audit the codebase for OWASP Top 10 vulnerabilities, hardcoded secrets, injection flaws, broken authentication, and insecure dependencies. You have READ-ONLY access to source files. Report findings clearly with file paths, line references, severity, and recommended fixes. DO NOT modify code unless explicitly asked.',
    expertise: [
      'OWASP Top 10',
      'input validation',
      'authentication',
      'authorization',
      'secrets management',
      'dependency vulnerabilities',
      'SQL injection',
      'XSS',
      'CSRF',
      'security headers',
    ],
    allowedTools: [
      'readFile',
      'searchFiles',
      'searchText',
      'listDirectory',
      'runCommand',
      'sendMessage',
      'broadcastMessage',
      'checkInbox',
      'getTaskList',
      'updateTaskStatus',
      'claimTask',
      'getDiagnostics',
      'getSymbolInfo',
    ],
    icon: '🔒',
  },

  // ─── 5. Code Reviewer ───────────────────────────────────────
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description:
      'Reviews code for quality, design patterns, readability, performance, and consistency. Read-only access.',
    systemPrompt:
      'You are a senior Code Reviewer. Review code for quality, readability, maintainability, and adherence to established patterns. Flag code smells, anti-patterns, excessive complexity, inconsistent naming, and missing error handling. You have READ-ONLY access. Provide clear, actionable feedback with file paths and line references.',
    expertise: [
      'code quality',
      'design patterns',
      'SOLID principles',
      'readability',
      'performance',
      'naming conventions',
      'code smells',
      'refactoring',
    ],
    allowedTools: [
      'readFile',
      'searchFiles',
      'searchText',
      'listDirectory',
      'sendMessage',
      'broadcastMessage',
      'checkInbox',
      'getTaskList',
      'updateTaskStatus',
      'claimTask',
      'getDiagnostics',
      'getSymbolInfo',
    ],
    icon: '👁️',
  },

  // ─── 6. DevOps Engineer ─────────────────────────────────────
  {
    id: 'devops',
    name: 'DevOps Engineer',
    description:
      'Sets up CI/CD pipelines, Docker configurations, deployment scripts, monitoring, and infrastructure as code.',
    systemPrompt:
      'You are a senior DevOps Engineer. Set up reproducible build pipelines, Docker images, CI/CD workflows (GitHub Actions), and deployment configurations. Never hardcode secrets — use environment variables or secret managers. Optimise Docker image sizes, configure proper health checks, and write clear deployment documentation.',
    expertise: [
      'CI/CD pipelines',
      'Docker',
      'deployment configs',
      'monitoring',
      'infrastructure',
      'GitHub Actions',
      'environment variables',
      'Kubernetes',
      'Terraform',
    ],
    allowedTools: ['*'],
    icon: '🚀',
  },

  // ─── 7. Documentation Writer ────────────────────────────────
  {
    id: 'doc-writer',
    name: 'Documentation Writer',
    description:
      'Creates and updates README files, API docs, JSDoc/TSDoc comments, user guides, and architecture documentation.',
    systemPrompt:
      'You are a senior Documentation Writer. Write clear, concise documentation that helps developers get started quickly. Create README files with setup instructions and usage examples. Add JSDoc/TSDoc to public APIs. Keep documentation in sync with the code. Use proper Markdown formatting.',
    expertise: [
      'README files',
      'API documentation',
      'code comments',
      'user guides',
      'architecture docs',
      'JSDoc',
      'TSDoc',
      'Markdown',
    ],
    allowedTools: [
      'readFile',
      'writeFile',
      'editFile',
      'searchFiles',
      'searchText',
      'listDirectory',
      'sendMessage',
      'broadcastMessage',
      'checkInbox',
      'getTaskList',
      'updateTaskStatus',
      'claimTask',
      'getDiagnostics',
      'getSymbolInfo',
    ],
    icon: '📝',
  },

  // ─── 8. Performance Optimizer ───────────────────────────────
  {
    id: 'perf-optimizer',
    name: 'Performance Optimizer',
    description:
      'Profiles code, identifies bottlenecks, optimises queries and bundle sizes, fixes memory leaks, and improves caching.',
    systemPrompt:
      'You are a senior Performance Optimizer. Always measure before optimising — use profiling data to identify actual bottlenecks. Focus on the critical path: N+1 queries, missing indexes, large bundle sizes, unnecessary re-renders, and memory leaks. Suggest caching strategies and code-splitting where appropriate.',
    expertise: [
      'profiling',
      'caching strategies',
      'query optimization',
      'bundle size',
      'lazy loading',
      'memory leaks',
      'algorithmic complexity',
      'indexing',
      'code splitting',
    ],
    allowedTools: ['*'],
    icon: '⚡',
  },
];

// ─── Lookup helpers ─────────────────────────────────────────────

/** Find a role preset by its ID. */
export function getRoleById(id: string): AgentRole | undefined {
  return ROLE_PRESETS.find((r) => r.id === id);
}

/**
 * Return a compact list of role options for the onboarding UI.
 */
export function getRolePresetOptions(): {
  id: string;
  name: string;
  icon: string;
  description: string;
}[] {
  return ROLE_PRESETS.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    description: r.description,
  }));
}

/** Sentinel option: let the lead agent choose automatically. */
export const LEAD_DECIDES_OPTION = {
  id: 'auto',
  name: 'Let Lead Decide',
  icon: '🤖',
  description: 'The lead agent will choose the best role for this position',
} as const;

/** Sentinel option: define a custom role via freeform text. */
export const CUSTOM_ROLE_OPTION = {
  id: 'custom',
  name: 'Custom Role',
  icon: '✏️',
  description: 'Define a custom role with your own description',
} as const;
