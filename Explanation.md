# AgentMind: Architecture & Design Explanation

A comprehensive guide to understanding how AgentMind works, why each component exists, and the design decisions behind it.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Core Concepts](#core-concepts)
4. [File Structure Explanation](#file-structure-explanation)
5. [Design Decisions](#design-decisions)
6. [Alternative Approaches Considered](#alternative-approaches-considered)

---

## Project Overview

**AgentMind** is a VS Code extension that orchestrates multiple AI agents working collaboratively on software development tasks. It's built on three core ideas:

1. **Multi-Agent Collaboration** — Multiple specialized agents (Backend Dev, Frontend Dev, Test Engineer, etc.) work together
2. **Task-Driven Architecture** — Work is organized as tasks with dependencies, priorities, and status tracking
3. **Decentralized Coordination** — Agents communicate via a shared mailbox and task list, managed by a Team Lead

The key innovation: Instead of one large LLM handling everything, we decompose work and assign it to specialized agents, enabling better focus, error recovery, and parallelization.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                 VS Code Chat Interface                      │
│              (User: @agentmind "build an API")              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │   Onboarding Flow              │
        │ (Team size + role selection)   │
        └────────────┬───────────────────┘
                     │
                     ▼
        ┌────────────────────────────────┐
        │   Team Lead (5 Phases)         │
        │ 1. Plan - Decompose request    │
        │ 2. Assign - Match to agents    │
        │ 3. Monitor - Track progress    │
        │ 4. Verify - Check completion   │
        │ 5. Complete - Report results   │
        └────────┬───────────────────────┘
                 │
        ┌────────┴──────────┬──────────────┐
        ▼                   ▼              ▼
    ┌────────┐          ┌────────┐    ┌────────┐
    │Agent 1 │          │Agent 2 │    │Agent 3 │
    │Backend │          │Frontend│    │Tests   │
    └────┬───┘          └───┬────┘    └───┬────┘
         │                  │             │
         └──────────────────┼─────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         │                                     │
         ▼                                     ▼
   ┌──────────────────┐            ┌─────────────────────┐
   │  Shared State    │            │  Tool Access        │
   │ in .agentmind/   │            │                     │
   ├──────────────────┤            ├─────────────────────┤
   │ • tasks/         │            │ • readFile          │
   │ • mailbox/       │            │ • writeFile         │
   │ • locks/         │            │ • editFile          │
   │ • state/         │            │ • runCommand        │
   └──────────────────┘            │ • searchFiles       │
                                   │ • getDiagnostics    │
                                   └─────────────────────┘
```

---

## Core Concepts

### 1. **Task-Based Decomposition**

Instead of giving one agent a vague request like "Build an API with auth and tests":

**Before (Single Agent):**
```
Agent: "Build an API with auth and tests"
[Tries to do everything, context gets huge, quality degrades]
```

**After (AgentMind - Multiple Tasks):**
```
Task 1: Design database schema (assigned to Backend Dev)
Task 2: Implement authentication endpoints (Backend Dev)
Task 3: Build UI login form (Frontend Dev)
Task 4: Write unit + integration tests (Test Engineer)
Task 5: Security review (Security Reviewer)

[Each agent focuses on one thing, better results]
```

**Why:** Specialization improves quality. Just like a team of engineers is better than one person trying to do everything.

### 2. **Dependency Graph**

Tasks can depend on other tasks:
```
Task A (Design DB) ─┐
                    ├─→ Task C (Write API) ─→ Task D (Test API)
Task B (Plan API) ──┘
```

Task C cannot start until A and B are done. This prevents:
- Frontend dev trying to build UI before API is ready
- Tests running against non-existent endpoints
- Wasted effort on incompatible changes

**Why:** Real-world work has dependencies. Respecting them prevents rework and parallelizes correctly.

### 3. **Lock-Based Concurrency**

Multiple agents can work simultaneously, but they might clash:
```
Agent 1: Reading src/api.ts
Agent 2: Writing src/api.ts  ← COLLISION!
```

Solution: Use file locks (stored in `.agentmind/locks/`)
```
Agent 1: acquires lock on src/api.ts
Agent 2: waits...
Agent 1: releases lock
Agent 2: now can write
```

**Why:** Prevents data corruption. Without locks, agent edits could overwrite each other randomly.

### 4. **JSONL Mailbox**

Agents communicate via a simple append-log (JSONL = JSON Lines):
```jsonl
{"from":"agent-1","to":"agent-2","content":"Need help with API","type":"direct"}
{"from":"agent-2","to":"agent-1","content":"Sure, what's wrong?","type":"direct"}
{"from":"lead","to":"all","content":"Team standup in 5 min","type":"broadcast"}
```

**Why:** 
- Immutable (append-only, never delete)
- Simple and fast (just append new lines)
- Works naturally with locks
- Human-readable for debugging

### 5. **Role-Based Tool Access**

Not all agents need all tools:
```
Backend Dev:        ✅ can edit code, run commands, write files
Security Reviewer:  ❌ cannot write/edit, only read & report
Test Engineer:      ✅ can write tests, run commands
```

**Why:** Principle of least privilege. Security reviewers shouldn't accidentally modify code. Prevents mistakes.

### 6. **Pseudoterminal Output**

Each agent gets its own terminal in VS Code:
```
Terminal 1 [Backend Dev]:
> npm run build
✓ Build successful

Terminal 2 [Test Engineer]:
> npm test
✓ 79 tests passed

Terminal 3 [Frontend Dev]:
> npm run dev
✓ Server running on :3000
```

**Why:** 
- User sees live progress
- Easier to debug agent issues
- More interactive than just logging
- Parallels are visible in realtime

---

## File Structure Explanation

### **Root Level**

```
AgentMind/
├── package.json                    # Node dependencies, scripts
├── tsconfig.json                   # TypeScript configuration (strict mode)
├── vitest.config.ts                # Test runner config (79 tests)
├── esbuild.js                      # Extension bundler
├── README.md                        # User-facing documentation
├── LICENSE                          # MIT License
├── .github/workflows/ci.yml         # GitHub Actions CI/CD
└── prompts/                         # JSON phase specifications for reproduction
```

#### **package.json** — Why This Matters

```json
{
  "name": "agentmind",
  "activationEvents": ["onChatParticipant:agentmind.lead"],
  "main": "dist/extension.js",
  "scripts": {
    "compile": "node esbuild.js",
    "test": "vitest run",
    "watch": "node esbuild.js --watch"
  },
  "devDependencies": {
    "vscode": "^1.96.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

**Key concepts:**
- `activationEvents`: Tells VS Code "activate when user types @agentmind"
- `main`: Points to bundled extension
- Only `vscode` in devDeps (externalized by esbuild = not bundled)

---

### **src/types.ts** — The Data Schema

This file defines all TypeScript interfaces. It's the "source of truth" for what data flows through the system.

**Key Types:**

```typescript
interface Task {
  id: string;           // "task-001"
  title: string;        // "Build REST API"
  status: TaskStatus;   // "pending" | "blocked" | "in-progress" | "completed" | "failed"
  dependencies: string[];  // IDs of tasks this depends on
  blockedBy: string[];  // Computed: which tasks block this one
  assignedTo: string | null;  // e.g., "agent-1"
  claimedBy: string | null;   // Which agent is actively working on it
  priority: TaskPriority;  // "critical" | "high" | "medium" | "low"
  result: string | null;     // Completion result/output
  filesModified: string[];   // ["src/api.ts", "src/auth.ts"]
}

interface AgentMessage {
  id: string;           // "msg-001" 
  from: string;         // "agent-1" or "system"
  to: string;           // "agent-2" or "all"
  type: MessageType;    // "direct" | "broadcast" | "system"
  content: string;      // Actual message text
  read: boolean;        // Has recipient read this?
  replyTo: string | null; // Links to previous message
  timestamp: string;    // ISO timestamp
}

interface AgentState {
  agentId: string;      // "agent-1"
  role: string;         // "backend-dev"
  status: AgentStatus;  // "idle" | "working" | "shutdown"
  currentTask: string | null;  // Task ID being worked on
  lastHeartbeat: string; // For crash detection
}
```

**Why separate file?**
- Single source of truth
- Type safety across entire codebase
- Easy to extend (add fields, everyone knows about them)
- Contracts between modules

---

### **src/communication/** — Inter-Agent Messaging & Task Management

#### **lockManager.ts** — File Locking

**Problem:** Two agents editing the same file simultaneously causes data corruption.

**Solution:** Use file-based locks (proper-lockfile library)

```typescript
class LockManager {
  async acquireLock(resourcePath: string): Promise<() => Promise<void>> {
    // Blocks until lock acquired
    const release = await properLockfile.lock(lockPath);
    return release;  // Function to release lock
  }

  async withLock<T>(resourcePath: string, fn: () => Promise<T>): Promise<T> {
    const release = await this.acquireLock(resourcePath);
    try {
      return await fn();  // Do work while holding lock
    } finally {
      await release();    // Always release, even if error
    }
  }
}
```

**Why this approach?**
- **Blocking** — Agent waits if lock held (not busy-wait spinning)
- **Serialization** — Only one agent modifies a resource at a time
- **Cross-process** — Works even if agents in different Node processes
- **Timeout protection** — proper-lockfile has built-in timeout

**Alternatives considered:**
- ❌ Database transactions — overkill, no local DB
- ❌ In-memory mutex — doesn't work across agents
- ❌ Message queue — adds network overhead
- ✅ File locks — simple, reliable, already proven pattern

---

#### **taskList.ts** — Task CRUD & Dependency Tracking

**Problem:** Need to track task status, assignments, dependencies, and ensure safe concurrent updates.

**Solution:** Each task is a separate JSON file in `.agentmind/tasks/`

```typescript
class TaskList {
  async createTask(options: CreateTaskOptions): Promise<Task> {
    // Generate unique ID: task-001, task-002, etc.
    const taskId = generateTaskId();
    
    // Compute blockedBy from dependencies
    const blockedBy = await this.computeBlockedBy(dependencies);
    
    // If any dependencies pending, mark as blocked
    status = blockedBy.length > 0 ? 'blocked' : 'pending';
    
    // Write to disk with lock
    await lockManager.withLock(taskPath, async () => {
      await fs.writeFile(taskPath, JSON.stringify(task), 'utf-8');
    });
  }

  async claimTask(taskId: string, agentId: string): Promise<Task | null> {
    // Can only claim if pending (not blocked or in-progress)
    if (task.status !== 'pending') return null;
    
    task.status = 'in-progress';
    task.claimedBy = agentId;
    
    // Persist update
    await lockManager.withLock(taskPath, async () => {
      await fs.writeFile(taskPath, JSON.stringify(task), 'utf-8');
    });
    
    return task;
  }

  async unblockDependents(completedTaskId: string): Promise<string[]> {
    // Find all tasks that depend on this one
    const dependents = tasks.filter(t => 
      t.dependencies.includes(completedTaskId)
    );
    
    // For each, remove from blockedBy and change status to pending
    for (const dependent of dependents) {
      dependent.blockedBy = dependent.blockedBy.filter(
        id => id !== completedTaskId
      );
      if (dependent.blockedBy.length === 0) {
        dependent.status = 'pending';  // Now ready!
      }
      await fs.writeFile(...);
    }
  }
}
```

**Why this design?**

- **File-per-task** — Easy to lock individual tasks without global lock
- **Dependency tracking** — Explicit blockedBy array prevents forgotten dependencies
- **Automatic unblocking** — Once all deps done, task automatically becomes available
- **Lock integration** — Every write goes through lockManager

**Alternatives considered:**
- ❌ Single JSON file for all tasks — would need global lock, bottleneck
- ❌ Database (SQLite, MongoDB) — overkill for local project
- ✅ Individual JSON files — simple, scales well, natural locking

---

#### **mailbox.ts** — Inter-Agent Messaging

**Problem:** Agents need to communicate without seeing each other directly (loose coupling).

**Solution:** JSONL append-log per agent + broadcast log

```
.agentmind/mailbox/
├── agent-1.jsonl      # Messages TO agent-1
├── agent-2.jsonl      # Messages TO agent-2
├── agent-3.jsonl      # Messages TO agent-3
└── broadcast.jsonl    # Messages for everyone

# Format:
{"id":"msg-001","from":"agent-1","to":"agent-2","content":"Need help?","type":"direct",...}
{"id":"msg-002","from":"lead","to":"all","content":"Team standup","type":"broadcast",...}
```

```typescript
class Mailbox {
  async sendDirectMessage(from: string, to: string, content: string): Promise<AgentMessage> {
    const msg = {
      id: generateMessageId(),
      from, to, content,
      type: 'direct',
      read: false,
      timestamp: new Date().toISOString()
    };
    
    // Append to recipient's inbox with lock
    await lockManager.withLock(inboxPath, async () => {
      await fs.appendFile(inboxPath, JSON.stringify(msg) + '\n');
    });
    
    return msg;
  }

  async getUnreadMessages(agentId: string): Promise<AgentMessage[]> {
    // Read own inbox + new broadcasts
    const inbox = await this.readInbox(agentId);
    const broadcasts = await this.getNewBroadcasts(agentId);
    return [...inbox, ...broadcasts].filter(m => !m.read);
  }
}
```

**Why JSONL?**

- **Append-only** — Never rewrite file, just add lines. Atomic.
- **Lock-friendly** — Can hold lock short (just append), prevents contention
- **Human-readable** — Each line is valid JSON, can read with text editor
- **Fast** — No parsing full file each time (with offset tracking)

**Alternatives considered:**
- ❌ In-memory queue — loses messages if process crashes
- ❌ Database — overkill, adds complexity
- ❌ File per message — too many files
- ✅ JSONL append-log — proven pattern (used by Kafka, databases)

---

### **src/storage/** — Workspace & Agent State

#### **workspace.ts** — Directory Structure

**Problem:** Need a consistent directory layout for all AgentMind data.

**Solution:** Initialize `.agentmind/` tree on startup

```typescript
export async function initializeWorkspace(workspaceRoot: string) {
  const dirs = [
    '.agentmind/',                 // Root
    '.agentmind/tasks/',           // Task JSON files
    '.agentmind/mailbox/',         // Message logs
    '.agentmind/state/',           // Agent heartbeat files
    '.agentmind/locks/',           // Lock marker files
  ];
  
  for (const dir of dirs) {
    await fs.mkdir(path.join(workspaceRoot, dir), { recursive: true });
  }
}

export async function writeAgentState(workspaceRoot: string, state: AgentState) {
  // .agentmind/state/agent-1.json
  const statePath = path.join(workspaceRoot, '.agentmind/state', `${state.agentId}.json`);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

export async function isAgentAlive(
  workspaceRoot: string, 
  agentId: string, 
  thresholdMs = 30_000
): Promise<boolean> {
  // Check if lastHeartbeat < 30s old
  // If older, agent likely crashed
  const state = await readAgentState(workspaceRoot, agentId);
  if (!state) return false;
  
  const lastBeat = new Date(state.lastHeartbeat).getTime();
  return Date.now() - lastBeat < thresholdMs;
}
```

**Why?**

- **Consistent layout** — All agents know where data lives
- **Gitignore-safe** — `.agentmind/` can be added to .gitignore
- **Crash detection** — Heartbeat timestamps detect dead agents
- **Isolated** — Doesn't pollute workspace root

---

#### **agentmindMd.ts** — Project Context

**Problem:** Agents need context about the project (files, conventions, structure).

**Solution:** Generate `.agentmind/AGENTMIND.md` with context

```typescript
export async function generateAgentmindMd(
  teamConfig: TeamConfig,
  tasks: Task[],
  projectConventions: ProjectConventions,
  fileOverview: string
): Promise<string> {
  return `
# AgentMind Context

## Team
- Lead: ${teamConfig.lead.name}
- Members:
  ${teamConfig.agents.map(a => `  - ${a.name} (${a.role})`).join('\n')}

## Current Tasks
${tasks.map(t => `- [\${t.status === 'completed' ? 'x' : ' '}] ${t.title} (${t.priority})`).join('\n')}

## Project Structure
\`\`\`
${fileOverview}
\`\`\`

## Coding Conventions
- Language: ${projectConventions.language}
- Package manager: ${projectConventions.packageManager}
- Test framework: ${projectConventions.testFramework}
- Linter: ${projectConventions.linter}
  `;
}
```

**Why?**

- **Context window optimization** — Give agents relevant context efficiently
- **Single source of truth** — Regenerated as tasks complete
- **Easy to read** — Markdown format agents can understand
- **Reduces hallucination** — Special project details prevent LLM mistakes

---

### **src/llm/** — Language Model Integration

#### **modelAccess.ts** — Agent Loop with Tool Calling

**Problem:** Agents need to call tools (readFile, runCommand, etc.) and iterate until task done.

**Solution:** Agentic loop with tool calling

```typescript
class AgentLLM {
  async runAgentLoop(
    task: Task,
    role: AgentRole,
    context: string
  ): Promise<ToolCallResult[]> {
    const systemPrompt = buildLeadSystemPrompt(role);
    const history: LanguageModelMessage[] = [];
    
    // Iteration 1: Agent analyzes task
    const response1 = await this.sendRequest(
      systemPrompt,
      `Analyze this task: ${task.description}`
    );
    // → Agent decides to read files, run tests, etc.
    
    // Iteration 2: Execute tools
    const toolResults = [];
    for (const toolCall of response1.toolUses) {
      const result = await this.executeTool(toolCall);
      toolResults.push(result);
    }
    
    // Iteration 3: Agent thinks about results
    const response2 = await this.sendRequest(
      systemPrompt,
      `Here are the results:\n${JSON.stringify(toolResults)}\nNext steps?`
    );
    
    // Repeat until agent says "done"
    let iterations = 0;
    while (iterations < MAX_ITERATIONS && !response.isComplete) {
      // ... more iterations
      iterations++;
    }
    
    return toolResults;
  }
}
```

**Why this pattern?**

- **Agentic loops** — Agent has control flow, can retry on errors
- **Tool grounding** — Agent can inspect real files/errors vs hallucinating
- **Iteration limit** — MAX_ITERATIONS prevents infinite loops
- **History tracking** — Full conversation context helps agent reason

**Alternatives considered:**
- ❌ Single turn — Agent tries to do everything at once (fails)
- ❌ Function calls only (no tool use)  — Agent can't inspect results
- ✅ Agentic loops — Proven in GPT-4, Claude, etc.

---

#### **toolDefinitions.ts** — Tool Schema

**Problem:** LLM needs to know what tools exist and their parameters.

**Solution:** Define tools in LLM-compatible format

```typescript
const AGENT_TOOLS: Record<string, LanguageModelToolDefinition> = {
  readFile: {
    name: 'readFile',
    description: 'Read file contents, optionally by line range',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from workspace root' },
        startLine: { type: 'number', description: 'Start line (1-indexed)' },
        endLine: { type: 'number', description: 'End line (1-indexed)' }
      },
      required: ['path']
    }
  },
  writeFile: {
    name: 'writeFile',
    description: 'Create or overwrite a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    }
  },
  // ... more tools
};

export function getToolsForRole(role: AgentRole): LanguageModelToolDefinition[] {
  // Security reviewer can't write → filter tools
  if (role.allowedTools[0] === '*') {
    return Object.values(AGENT_TOOLS);
  }
  return Object.values(AGENT_TOOLS).filter(t => role.allowedTools.includes(t.name));
}
```

**Why?**

- **LLM-compatible schema** — LLM understands parameters
- **Role-based filtering** — Some agents shouldn't have write access
- **Documentation** — Each tool has clear description
- **Type safety** — TypeScript ensures definition matches handler

---

### **src/orchestrator/** — Team Coordination

#### **teamLead.ts** — 5-Phase Lifecycle

**Problem:** Multiple agents need coordination without explicit messaging.

**Solution:** Team Lead orchestrates 5 phases

```typescript
class TeamLead {
  async runTeamSession(request: string): Promise<void> {
    // Phase 1: PLAN
    const taskPlan = await this.planPhase(request);
    // Decomposes "build API with auth and tests" 
    // into 5 concrete tasks
    
    for (const task of taskPlan.tasks) {
      await this.tasklist.createTask({
        title: task.title,
        description: task.description,
        dependencies: task.dependencies,
        priority: task.priority
      });
    }

    // Phase 2: ASSIGN
    for (const task of taskPlan.tasks) {
      const bestAgent = await this.assignPhase(task);
      await this.tasklist.updateTask(task.id, { 
        assignedTo: bestAgent.id 
      });
    }

    // Phase 3: MONITOR
    while (true) {
      const summary = await this.tasklist.getTaskSummary();
      if (summary.completed === summary.total) {
        break;  // All done
      }
      
      // Check for failures, reassign if needed
      const failures = await this.tasklist.getAllTasks()
        .filter(t => t.status === 'failed');
      
      for (const failed of failures) {
        const retryAgent = await this.assignPhase(failed);
        await this.tasklist.claimTask(failed.id, retryAgent.id);
      }
      
      await sleep(5000);  // Poll every 5s
    }

    // Phase 4: VERIFY
    const allTasks = await this.tasklist.getAllTasks();
    const allPassed = allTasks.every(t => t.status === 'completed');
    if (!allPassed) {
      throw new Error('Verification failed');
    }

    // Phase 5: COMPLETE
    await this.reportResults(allTasks);
  }
}
```

**Why 5 phases?**

| Phase | Why | What If Skipped |
|-------|-----|-----------------|
| **Plan** | Decompose complex requests | Agent tries to do everything at once, fails |
| **Assign** | Match tasks to best agents | Wrong agent wrong job, inefficient |
| **Monitor** | Track progress, handle failures | Agent fails, no one notices, stuck forever |
| **Verify** | Ensure quality | Incomplete/broken code shipped |
| **Complete** | Report back to user | User doesn't know what happened |

**Alternatives considered:**
- ❌ No phases, agents self-organize — chaos, race conditions
- ❌ Single coordinator phase — no parallelism
- ✅ 5-phase lifecycle — proven in project management (Waterfall, Agile)

---

#### **teammate.ts** — Autonomous Agent Loop

**Problem:** Each agent needs to autonomously work on assigned tasks.

**Solution:** Infinite loop: claim task → work → complete/fail

```typescript
class TeammateAgent {
  async runAutonomously(): Promise<void> {
    const agent = this.agentConfig;
    
    while (true) {
      // Every 5 seconds
      this.sendHeartbeat();  // "I'm alive"
      
      // Find available tasks
      const available = await this.tasklist.getAvailableTasks();
      if (available.length === 0) {
        // Wait for new tasks
        await sleep(5000);
        continue;
      }
      
      // Try to claim a task
      const task = available[0];  // Or use priority/role matching
      const claimed = await this.tasklist.claimTask(task.id, agent.id);
      
      if (!claimed) {
        continue;  // Another agent beat us to it
      }
      
      // Work on the task
      try {
        const result = await this.modelAccess.runAgentLoop(
          claimed,
          agent.role,
          this.getContext()
        );
        
        await this.tasklist.completeTask(claimed.id, result.summary);
      } catch (error) {
        await this.tasklist.failTask(claimed.id, error.message);
        await this.mailbox.sendDirectMessage(
          agent.id,
          'lead',
          `Failed on ${claimed.id}: ${error.message}`
        );
      }
    }
  }
}
```

**Why?**

- **Autonomous** — No central scheduler, agents self-organize
- **Heartbeat** — Lead can detect crashes
- **Failure handling** — Failed tasks don't crash everything
- **Messaging** — Agent reports failures to lead

---

### **src/roles/** — Agent Specifications

#### **presets.ts** — 8 Role Definitions

**Problem:** Need to define different agent types with different skills and constraints.

**Solution:** 8 role presets with expertise, tools, system prompts

```typescript
const ROLE_PRESETS: AgentRole[] = [
  {
    id: 'backend-dev',
    name: 'Backend Developer',
    description: 'REST/GraphQL APIs, databases, auth',
    systemPrompt: `You are a senior Backend Dev...
      Write clean code, use SOLID principles, proper error handling.`,
    expertise: ['API design', 'database schemas', 'REST', 'authentication'],
    allowedTools: ['*'],  // Can use any tool
    icon: '⚙️'
  },
  {
    id: 'security-reviewer',
    name: 'Security Reviewer',
    description: 'Audits code for OWASP vulnerabilities',
    systemPrompt: `You are a security expert...
      Read-only access. Report findings with severity and fixes.`,
    expertise: ['OWASP Top 10', 'authentication', 'encryption'],
    allowedTools: [  // Restricted: no write tools
      'readFile', 'searchFiles', 'searchText', 'getDiagnostics'
    ],
    icon: '🔒'
  },
  // 6 more roles...
];
```

**Why this approach?**

- **Role-specific system prompts** — "You are a backend dev" vs "You are a QA tester" produces different outputs
- **Expertise arrays** — Team Lead uses these to match tasks to agents
- **Tool restrictions** — Security reviewer can't accidentally modify code
- **Extensible** — Easy to add new roles

**Alternatives considered:**
- ❌ Single generic agent — loses specialization benefit
- ❌ LLM-generated roles — unstable, unreliable
- ✅ Hardcoded role presets — predictable, safe, extensible

---

### **src/tools/** — External Actions

#### **fileTools.ts** — File Operations with Security

**Problem:** Agents need to read/write/edit files, but must not escape workspace (path traversal attacks).

**Solution:** Wrapper around Node.js fs with path validation

```typescript
class FileToolHandlers {
  private validatePath(relativePath: string): string {
    // Reject ".."
    if (relativePath.includes('..')) {
      throw new Error(`Path traversal: "${relativePath}" contains ".."`)
    }
    
    // Resolve to absolute, check it's within workspace
    const absPath = path.resolve(this.workspaceRoot, relativePath);
    const resolvedRoot = path.resolve(this.workspaceRoot);
    
    if (!absPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Path escapes workspace: "${relativePath}"`);
    }
    
    return absPath;
  }

  async readFile(input: { path: string; startLine?: number; endLine?: number }) {
    const absPath = this.validatePath(input.path);
    const content = await fs.readFile(absPath, 'utf-8');
    // ... handle line ranges
    return { success: true, output: content };
  }

  async editFile(input: { path: string; oldString: string; newString: string }) {
    const absPath = this.validatePath(input.path);
    const content = await fs.readFile(absPath, 'utf-8');
    
    // Find exact match (no fuzzy matching)
    const idx = content.indexOf(input.oldString);
    if (idx === -1) {
      throw new Error('Old string not found exactly');
    }
    
    // Replace and write back
    const updated = content.slice(0, idx) + input.newString +
                    content.slice(idx + input.oldString.length);
    await fs.writeFile(absPath, updated, 'utf-8');
  }
}
```

**Why?**

- **Path validation** — Prevents `../../system/critical` attacks
- **Exact string matching** — Prevents agent from making wrong edits
- **Error clarity** — If edit fails, agent knows why
- **Line range support** — Agents don't need to see entire file

**Security lessons:**
- ❌ Simple path concatenation → vulnerable
- ❌ Allow ".." — easily escape
- ❌ RegEx replace → can match wrong lines
- ✅ Whitelist workspace, validate paths, exact matching

---

#### **terminalTools.ts** — Command Execution with Safety

**Problem:** Agents need to run commands, but some are dangerous (rm -rf /, format drives, etc.).

**Solution:** Blocklist dangerous patterns before execution

```typescript
class TerminalToolHandlers {
  private readonly BLOCKED_PATTERNS = [
    { pattern: /rm\s+-rf\s+\/(?!\S*\.agentmind)/i, reason: 'rm -rf / blocked' },
    { pattern: /format\s+[A-Z]:/i, reason: 'format C: blocked' },
    { pattern: /dd\s+if=/i, reason: 'dd blocked' },
    { pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/i, reason: 'fork bomb blocked' },
    { pattern: /curl\s.*\|\s*(ba)?sh/i, reason: 'curl|sh blocked' },
  ];

  isCommandSafe(command: string): { safe: boolean; reason?: string } {
    for (const { pattern, reason } of this.BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return { safe: false, reason };
      }
    }
    return { safe: true };
  }

  async runCommand(input: { command: string; cwd?: string }): Promise<ToolCallResult> {
    const safety = this.isCommandSafe(input.command);
    if (!safety.safe) {
      return { success: false, error: `Blocked: ${safety.reason}` };
    }
    
    // Run with timeout and buffer limits
    return new Promise((resolve) => {
      exec(input.command, {
        timeout: 60_000,  // 60 second limit
        maxBuffer: 1024 * 1024,  // 1MB output limit
        cwd: input.cwd || this.workspaceRoot
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, error: error.message });
        } else {
          resolve({ success: true, output: stdout + stderr });
        }
      });
    });
  }
}
```

**Why this approach?**

| Protection | Why |
|-----------|-----|
| **Blocklist vs allow-list** | Easier to maintain, catch edge cases |
| **Timeout** | Prevent infinite loops (npm install stuck?) |
| **maxBuffer** | Prevent OOM (command produces 10GB output) |
| **cwd validation** | Can't cd into parent directories |
| **exec vs spawn** | Simpler for agents, handles pipes naturally |

**Alternatives considered:**
- ❌ Allow-list (only npm, git, etc.) — too restrictive
- ❌ No timeout — command hangs, everything stuck
- ❌ Run as unprivileged user — overkill for local dev
- ✅ Blocklist + timeout + buffer limits — practical balance

---

#### **codeTools.ts** — VS Code API Integration

**Problem:** Agents need to inspect code (find definitions, get errors).

**Solution:** Wrapper around VS Code's Language Server API

```typescript
class CodeToolHandlers {
  async getDiagnostics(filePath: string): Promise<Diagnostic[]> {
    const uri = vscode.Uri.file(this.resolvePath(filePath));
    return vscode.languages.getDiagnostics(uri);
    // Returns TypeScript errors, linter warnings, etc.
  }

  async getSymbolInfo(filePath: string, symbol: string): Promise<SymbolInfo> {
    const uri = vscode.Uri.file(this.resolvePath(filePath));
    const location = await vscode.commands.executeCommand(
      'vscode.executeDefinitionProvider',
      uri,
      position  // Where symbol is used
    );
    return location;
  }
}
```

**Why?**

- **Grounding in real analysis** — Not LLM hallucination, actual errors
- **Reduces debugging time** — "Here are the 3 TypeScript errors"
- **Symbol navigation** — Agents can find where functions defined
- **IDE advantage** — Leverage VS Code's language servers

---

### **src/participant/** — VS Code Chat Integration

#### **handler.ts** — Chat Message Handler

**Problem:** User types `@agentmind "build an API"` but needs to:
1. Check if team already running
2. Run onboarding if needed
3. Orchestrate entire team session
4. Report back to user

**Solution:** Chat handler that coordinates everything

```typescript
export async function chatHandler(
  request: LanguageModelChatRequest,
  context: vscode.ExtensionContext
): Promise<LanguageModelChatResponse> {
  const userMessage = request.messages[0].content;
  
  // Check if team session running
  let session = activeSession.get(context.workspaceFolder.uri.fsPath);
  
  if (!session) {
    // Run onboarding
    const teamConfig = await onboardingFlow.ask(context);
    // → Ask user: how many agents? what roles?
    
    session = new TeamSession(teamConfig);
    activeSession.set(context.workspaceFolder.uri.fsPath, session);
  }
  
  // Special commands
  if (userMessage.includes('/status')) {
    const tasks = await session.taskList.getAllTasks();
    const summary = tasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});
    return createResponse(`Status: ${JSON.stringify(summary)}`);
  }
  
  if (userMessage.includes('/stop')) {
    await session.shutdown();
    activeSession.delete(context.workspaceFolder.uri.fsPath);
    return createResponse('Team stopped.');
  }
  
  // Normal request: spin up team
  const result = await session.lead.runTeamSession(userMessage);
  // → Leads 5-phase orchestration
  
  return createResponse(result);
}
```

**Why?**

- **Stateful** — Remembers team across requests
- **Command support** — `/status`, `/stop` without re-parsing request
- **Onboarding** — User selects team composition interactively
- **Error handling** — Unexpected errors don't crash team

---

#### **onboarding.ts** — Interactive Setup

**Problem:** User says "build an API" but we need to ask:
- How many agents? (2-5)
- What roles? (pick 8 presets or custom)

**Solution:** State machine asking questions

```typescript
export class OnboardingFlow {
  private state: OnboardingState = 'ask-team-size';

  async ask(context: vscode.ExtensionContext): Promise<TeamConfig> {
    // Step 1: Team size
    const teamSize = await vscode.window.showQuickPick(
      ['2 Agents', '3 Agents', '4 Agents', '5 Agents'],
      { title: 'Select team size' }
    );
    this.state = 'ask-roles';

    // Step 2: Roles
    const roles = [];
    for (let i = 0; i < parseInt(teamSize); i++) {
      const role = await vscode.window.showQuickPick(
        getRolePresetOptions().map(r => ({
          label: `${r.icon} ${r.name}`,
          value: r.id
        })),
        { title: `Select role ${i + 1}` }
      );
      roles.push(role);
    }
    this.state = 'confirm';

    // Step 3: Confirm
    const confirmed = await vscode.window.showWarningMessage(
      `Starting team with ${teamSize} agents: ${roles.join(', ')}?`,
      'Start',
      'Cancel'
    );

    if (confirmed !== 'Start') throw new Error('Cancelled');

    return {
      lead: { name: 'Team Lead', role: 'lead' },
      agents: roles.map((id, i) => ({
        id: `agent-${i + 1}`,
        name: getRoleById(id)!.name,
        role: id
      }))
    };
  }
}
```

**Why state machine?**

- **Linear flow** — User knows what step they're on
- **Reversible** — Can go back (with showInputBox)
- **Clear** — Not dumping 20 questions at once
- **Explainable** — User understands what they're setting up

---

### **src/terminal/** — Pseudoterminal Output

#### **agentTerminal.ts & formatter.ts** — Live Output

**Problem:** When agents work, user needs to see progress in real-time.

**Solution:** Each agent gets a pseudoterminal with ANSI-colored output

```typescript
export class AgentPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite = this.writeEmitter.event;

  write(output: string): void {
    this.writeEmitter.fire(output);
  }
}

export function createAgentTerminal(agent: AgentConfig): vscode.Terminal {
  const pty = new AgentPseudoterminal();
  const terminal = vscode.window.createTerminal({
    name: `${agent.icon} ${agent.name}`,
    pty,
    backgroundColor: agent.color
  });
  return terminal;
}

// Usage:
TerminalFormatter.success(`✓ Task completed: ${task.title}`);
TerminalFormatter.error(`✗ Build failed: ${error}`);
TerminalFormatter.info(`→ Running tests...`);
```

**Why?**

- **Live display** — User sees agent working in real-time
- **Color-coded** — Green success, red error
- **Icon badges** — Each agent has distinct emoji
- **Non-blocking** — VS Code UI responsive while agents work

---

### **src/__tests__/** — Comprehensive Testing

#### **Test Structure** (79 tests)

```
src/__tests__/
├── setup.ts                           # Vitest setup + vscode mocks
├── communication/
│   ├── lockManager.test.ts (8 tests)
│   ├── taskList.test.ts (15 tests)
│   └── mailbox.test.ts (13 tests)
├── tools/
│   ├── fileTools.test.ts (11 tests)
│   └── terminalTools.test.ts (9 tests)
├── roles/
│   └── presets.test.ts (9 tests)
├── storage/
│   └── workspace.test.ts (9 tests)
└── integration/
    └── teamFlow.test.ts (5 tests)
```

**Test Philosophy:**

| Category | What | Why |
|----------|------|-----|
| **Unit** | LockManager.acquireLock works | Foundation correctness |
| **Integration** | Task creation → claiming → completion | Real workflows |
| **Security** | Path traversal rejected | Prevent attacks |
| **Concurrency** | Multiple locks serialize | No race conditions |

**Example: task claiming concurrency test**
```typescript
it('concurrent claims — only one agent wins', async () => {
  const task = await taskList.createTask({...});
  
  // Race condition: 3 agents trying to claim same task
  const results = await Promise.all([
    taskList.claimTask(task.id, 'agent-1'),
    taskList.claimTask(task.id, 'agent-2'),
    taskList.claimTask(task.id, 'agent-3'),
  ]);
  
  // Only ONE should succeed (returns Task), others null
  const wins = results.filter(Boolean);
  expect(wins.length).toBe(1);
});
```

---

### **CI/CD** — GitHub Actions

#### **.github/workflows/ci.yml** — Automated Testing

**Problem:** How do we ensure commits don't break on different platforms/Node versions?

**Solution:** GitHub Actions matrix testing

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test
```

**Why?**

- **Multi-platform** — Ensures Windows/Mac/Linux all work
- **Multi-version** — Node 18 and 20 have different APIs
- **Automated** — Can't forget to test before pushing
- **Blocks merge** — PRs can't merge if tests fail

**Result:** 8 test runs (3 OS × 2 Node versions + linting + build)

---

## Design Decisions

### 1. Why File-Based State (Not Database)?

**Decision:** Use JSON files in `.agentmind/` directory

**Pros:**
- ✅ Zero external dependencies (no SQLite, MongoDB install)
- ✅ Version control friendly (can commit if needed)
- ✅ Inspectable with text editor
- ✅ Works offline
- ✅ Simple to implement

**Cons:**
- ❌ Not as efficient as database
- ❌ Manual migration for schema changes

**When to reconsider:** If this becomes a multi-workspace server, or needs distributed agents.

---

### 2. Why Append-Only JSONL (Not Update Files)?

**Decision:** Messages stored as append-only log

**Pros:**
- ✅ Atomic writes (just append)
- ✅ Lock contention minimal (short lock time)
- ✅ Crash-safe (never corrupting old data)
- ✅ Audit trail (all messages persisted)

**Cons:**
- ❌ File grows unbounded
- ❌ Deleting old messages requires rewrite

**When to reconsider:** If workspace has months of messages, could implement log rotation.

---

### 3. Why LLM Agentic Loop (Not Chain-of-Thought)?

**Decision:** Each agent runs autonomous loop, not static chain

**Pros:**
- ✅ Agent can retry on error
- ✅ Agent can inspect real results
- ✅ Can handle unexpected scenarios
- ✅ Closer to human problem solving

**Cons:**
- ❌ Less predictable (more iterations)
- ❌ Tokens more expensive (multiple LLM calls)

**When to reconsider:** If cost is critical, could use static chains.

---

### 4. Why Explicit Tool Definitions (Not Browsing)?

**Decision:** Define tools with JSON schema, not let LLM spontaneously browse

**Pros:**
- ✅ Safe (LLM can't call unknown tools)
- ✅ Predictable (agent knows exactly what's available)
- ✅ Efficient (no need to list dynamic capabilities)

**Cons:**
- ❌ Less flexible (hardcoded tool list)
- ❌ Manual to add tools

**When to reconsider:** If you need dynamic tool discovery.

---

### 5. Why Team Lead with 5 Phases (Not Flat Agents)?

**Decision:** One Team Lead orchestrates, not peers deciding together

**Pros:**
- ✅ Clear responsibility (Lead catches failures)
- ✅ Defined workflow (5 phases predictable)
- ✅ Easy to reason about
- ✅ Matches real team

**Cons:**
- ❌ Team Lead can be bottleneck
- ❌ Less peer-to-peer autonomy

**When to reconsider:** If you want emergent behavior or peer negotiation.

---

### 6. Why Read-Only Security Reviewer (Not Separate Process)?

**Decision:** Security Reviewer is an agent role (same process) but with restricted tools

**Pros:**
- ✅ Can access same async locks/messaging
- ✅ Integrated into workflow
- ✅ No separate process/language needed

**Cons:**
- ❌ Reviewer runs same Python as agents

**When to reconsider:** If you need formal verification or isolation.

---

## Alternative Approaches Considered

### Alternative 1: Message Queue (vs JSONL Mailbox)

**Considered:** Use Redis/RabbitMQ for messaging

**Why rejected:**
- ❌ Extra dependency to install & run
- ❌ Overkill for local development
- ❌ Lost messages on crash (vs append-log permanence)
- ✅ JSONL simpler, persistent, requires nothing

---

### Alternative 2: SQLite Database (vs JSON files)

**Considered:** Use database for state

**Why rejected:**
- ❌ Extra dependency
- ❌ More complex schema migrations
- ❌ Users can't inspect with text editor
- ✅ JSON files transparent, version-controllable

---

### Alternative 3: Orchestrator Agent (vs Team Lead)

**Considered:** Have one LLM agent manage all others (no hardcoded phases)

**Why rejected:**
- ❌ Less predictable (LLM might forget tasks)
- ❌ Harder to debug ("why didn't lead assign team?")
- ❌ More expensive (extra LLM calls to coordinate)
- ✅ Hardcoded phases→ deterministic, auditable

---

### Alternative 4: Shared Memory (vs File Locks)

**Considered:** Use in-memory shared state with mutex

**Why rejected:**
- ❌ Doesn't survive process crashes
- ❌ Only works in single process
- ❌ All agents must be in same Node process
- ✅ File locks→ durable, cross-process safe

---

### Alternative 5: Tool Sandboxing (vs Allowlist/Blocklist)

**Considered:** Run agent in Docker/VM for isolation

**Why rejected:**
- ❌ Heavy overhead
- ❌ Docker not installed on all systems
- ❌ Performance penalty
- ✅ Allowlist+blocklist→ practical security

---

## Learning Takeaways

### For Architecture:

1. **Specialization matters** — Multiple agents beat one generalist
2. **Explicit coordination** — Team Lead with defined phases beats emergent behavior
3. **Persistent state** — File-based simpler than in-memory
4. **Gradual abstraction** —Tasks→Messages→Tools progressively abstract work

### For Security:

1. **Validate all paths** — Path traversal is common attack
2. **Blocklist dangerous patterns** — Better than trying to parse safely
3. **Tool restrictions** — Different agents different access levels
4. **Audit trail** — Append-only logs for investigation

### For Testing:

1. **Unit + Integration** — Test components individually and together
2. **Concurrency** — Race conditions caught by concurrent tests
3. **Multi-platform** — GitHub Actions catches OS-specific bugs
4. **Real file I/O** — Temp workspaces test actual behavior

### For LLM Agents:

1. **Agentic loops** — Let agent iterate, not static one-shot
2. **Tool grounding** — Agent inspects real results, not hallucination
3. **Iteration limits** — Prevent infinite loops
4. **Role prompts** — SystemPrompt matters ("you are a backend dev")

---

## Conclusion

AgentMind demonstrates that:

- **Multi-agent systems are practical** for local development
- **Simple state management** (files + locks) beats complexity
- **Explicit coordination** (Team Lead, 5 phases) beats chaos
- **Tool restriction** prevents most security issues
- **Comprehensive testing** ensures reliability across platforms

The architecture is modular: if you want to replace JSONL with a database, add a new agent role, or implement peer negotiation, the design supports it.

---

**Created:** April 3, 2026  
**For:** Understanding AgentMind architecture & design decisions  
**See also:** README.md (user guide), .github/workflows/ci.yml (deployment)
