---
name: agentmind
description: "Collaborative multi-agent orchestration system. Assembles a team of specialist AI agents (backend, frontend, test, security, devops, docs, performance) that work together on complex software projects. The Team Lead decomposes requests into tasks, delegates to specialists, monitors progress, and ensures everything is built, tested, debugged, and delivered. Works in Claude Code, VS Code Copilot, Cursor, Windsurf, and any AI IDE."
user-invokable: true
argument-hint: "<your request>"
license: MIT
metadata:
  author: AbdulRahmanAzam
  version: "2.0.0"
  category: development
---

# AgentMind: Multi-Agent Orchestration

A collaborative multi-agent system where specialist AI agents work together on complex software projects. One Lead coordinates the team, each specialist deep-researches their tasks, they communicate through a shared workspace, and nothing ships until it compiles, passes tests, and is debugged.

**Invocation:** Mention `agentmind` or use `/agentmind <request>` depending on your IDE.

## How It Works

```
User Request: "Build a REST API with auth and tests"
         │
         ▼
┌──────────────────┐
│   Team Lead       │  ← Understands request, picks team, makes plan
│   (5 phases)      │
└────────┬─────────┘
         │
    ┌────┼────┬────────┐
    ▼    ▼    ▼        ▼
  ⚙️     🧪    🔒       📝
 Backend Test Security  Docs
    │    │    │        │
    └────┴────┴────────┘
         │
    Shared Workspace
    (.agentmind/)
    ├── tasks.json
    ├── mailbox/
    └── state/
```

## Available Agents

| Agent | Role | Access |
|-------|------|--------|
| `agentmind-lead` | Team Lead — orchestrates everything | Full |
| `agentmind-backend` | Backend Developer — APIs, databases, server logic | Full |
| `agentmind-frontend` | Frontend Developer — UI, components, styling | Full |
| `agentmind-test` | Test Engineer — unit, integration, e2e tests | Full |
| `agentmind-security` | Security Reviewer — OWASP audits, vulnerability scanning | Read-only |
| `agentmind-reviewer` | Code Reviewer — quality, patterns, maintainability | Read-only |
| `agentmind-devops` | DevOps Engineer — CI/CD, Docker, deployment | Full |
| `agentmind-docs` | Documentation Writer — README, API docs, guides | Full |
| `agentmind-perf` | Performance Optimizer — profiling, caching, optimization | Full |

## Orchestration Protocol

### Phase 1: Onboarding & Planning
The Team Lead:
1. Understands what the user wants to build
2. Asks clarifying questions if needed (tech stack, scope, quality requirements)
3. Selects 2-5 specialist agents based on the request
4. Presents the proposed team for confirmation
5. Decomposes the request into a task dependency graph
6. Writes the plan to `.agentmind/tasks.json`

### Phase 2: Execution
For each specialist agent:
1. A separate session/subagent is spawned with role instructions
2. The agent reads its tasks from `.agentmind/tasks.json`
3. **Deep research** — reads existing code, understands patterns, plans approach
4. Implements step by step, testing as it goes
5. Communicates via `.agentmind/mailbox/` (direct messages + broadcasts)
6. Marks tasks complete when done

### Phase 3: Monitoring
The Lead continuously:
- Reads broadcast messages for progress updates
- Answers agent questions from its mailbox
- Tracks task completion percentages
- Handles blockers and coordinates handoffs
- Mediates conflicts between agents

### Phase 4: Verification
Once all tasks are "completed":
1. Run build: `npm run build` (or equivalent)
2. Run tests: `npm test` (or equivalent)
3. Run linter: `npx eslint .` (or equivalent)
4. Run type checker: `npx tsc --noEmit` (for TypeScript)

If failures: create fix tasks → assign to responsible agent → re-monitor → re-verify (max 3 attempts).

### Phase 5: Completion
- Generate summary (what was built, files changed, architecture, test coverage)
- Report to user with full delivery

## Communication Protocol

All agents communicate through `.agentmind/mailbox/` in the workspace:

### File Structure
```
.agentmind/
├── tasks.json                    # Task list with status and dependencies
├── mailbox/
│   ├── broadcast.jsonl           # Team-wide announcements
│   ├── lead.jsonl                # Messages to the Team Lead
│   ├── agentmind-backend.jsonl   # Messages to Backend Dev
│   ├── agentmind-frontend.jsonl  # Messages to Frontend Dev
│   ├── agentmind-test.jsonl      # Messages to Test Engineer
│   └── ...                       # One file per agent
└── state/
    └── team.json                 # Current team roster and phase
```

### Message Format (JSONL — one JSON object per line)
```json
{"from": "agentmind-backend", "to": "agentmind-test", "content": "Auth endpoints ready at src/routes/auth.ts. Test /register, /login, /refresh.", "timestamp": "2025-04-03T10:30:00Z", "type": "direct"}
```

### Message Types
- `direct` — One agent to another (written to recipient's `.jsonl` file)
- `broadcast` — To all agents (written to `broadcast.jsonl`)
- `system` — System notifications from the Lead

## Task Format

```json
{
  "tasks": [
    {
      "id": "task-001",
      "title": "Set up project structure",
      "description": "Initialize project with TypeScript, configure linting, create folder structure",
      "assignee": "agentmind-backend",
      "priority": "critical",
      "dependencies": [],
      "status": "pending",
      "filesModified": []
    }
  ]
}
```

### Task Statuses
- `pending` — Ready to start (no unmet dependencies)
- `blocked` — Waiting for dependency tasks to complete
- `in-progress` — Agent is actively working
- `completed` — Done successfully
- `failed` — Failed (Lead will create fix tasks)

### Task Priorities
- `critical` — Blocks everything else, do first
- `high` — Important, do soon
- `medium` — Standard priority
- `low` — Nice to have, do last

## Agent Requirements

Every agent MUST:
1. **Deep research before coding** — read existing code, understand patterns, plan approach
2. **Work step by step** — not everything at once
3. **Communicate proactively** — broadcast completions, ask questions early
4. **Test their own work** — don't just write code and hope it works
5. **Follow project conventions** — match existing code style, naming, patterns
6. **Update task status** — mark tasks in `.agentmind/tasks.json` as they progress

## Error Recovery

| Scenario | Lead Action |
|----------|-------------|
| Agent stuck | Read their mailbox, provide guidance |
| Task dependency cycle | Restructure the task graph |
| Verification fails 3x | Report to user with errors |
| Conflicting code from agents | Mediate, pick better approach |
| User changes requirements | Re-plan, notify affected agents |

## IDE Compatibility

AgentMind works in any AI-powered IDE that supports agents/skills:

| IDE | How to Use |
|-----|-----------|
| **Claude Code** | `/agentmind <request>` or mention agentmind-lead |
| **VS Code Copilot** | `@agentmind <request>` in chat |
| **Cursor** | Reference the agentmind agent in chat |
| **Windsurf** | Reference the agentmind agent in Cascade |
| **Any AI IDE** | Copy agent files to IDE's agent config directory |

## Example Usage

```
User: Build a full-stack todo app with React frontend, Express API,
      PostgreSQL database, authentication, and comprehensive tests.

Lead: I'll assemble a team of 4:
      1. ⚙️ Backend Dev — Express API + PostgreSQL + JWT auth
      2. 🎨 Frontend Dev — React UI + state management
      3. 🧪 Test Engineer — Unit + integration + e2e tests
      4. 🔒 Security Reviewer — Auth audit + OWASP check

      Task plan: 12 tasks across 4 agents with dependencies.
      Proceed? (yes / adjust)

User: yes

Lead: 🚀 Team assembled. Spawning agents...
      [Backend Dev starts: project setup → DB schema → API routes → auth]
      [Frontend Dev waits for API, then: components → pages → state]
      [Test Engineer waits for code, then: unit → integration tests]
      [Security reviews auth after backend completes]

      ... agents work, communicate, complete tasks ...

Lead: ✅ All 12 tasks complete.
      ✅ Build passes. 47 tests passing. 0 security issues.

      Summary:
      - Created Express API with 8 endpoints
      - PostgreSQL with Prisma ORM, User + Todo models
      - JWT authentication (register, login, refresh)
      - React frontend with 6 components
      - 47 tests (32 unit, 15 integration)
      - Files: 28 created, 0 modified
```
