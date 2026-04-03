# 🧠 AgentMind

**Collaborative multi-agent orchestration for ANY AI IDE**

AgentMind transforms your AI coding assistant into a collaborative workspace where multiple specialist agents work together — planning, coding, reviewing, testing, and debugging — all coordinated by an intelligent Team Lead.

Works with **Claude Code**, **VS Code Copilot**, **Cursor**, **Windsurf**, and any AI-powered IDE.

---

## 🚀 Installation

### One-Line Install

**macOS / Linux:**
```bash
git clone --depth 1 https://github.com/AbdulRahmanAzam/AgentMind.git && bash AgentMind/install.sh
```

**Windows (PowerShell):**
```powershell
git clone --depth 1 https://github.com/AbdulRahmanAzam/AgentMind.git; powershell -ExecutionPolicy Bypass -File AgentMind\install.ps1
```

The installer auto-detects your IDEs and copies agent/skill files to the right locations:

| IDE | Agents Directory | Skills Directory |
|-----|-----------------|-----------------|
| Claude Code | `~/.claude/agents/` | `~/.claude/skills/agentmind/` |
| VS Code / Copilot | `~/.vscode/agents/` | `~/.vscode/skills/agentmind/` |
| Cursor | `~/.cursor/agents/` | `~/.cursor/skills/agentmind/` |
| Windsurf | `~/.codeium/windsurf/agents/` | `~/.codeium/windsurf/skills/agentmind/` |

### Uninstall

```bash
# macOS / Linux
bash AgentMind/uninstall.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File AgentMind\uninstall.ps1
```

---

## ✨ How It Works

You give AgentMind a request. The Team Lead assembles specialists, creates a task plan, and coordinates execution:

```
User: "Build a REST API with auth, tests, and docs"
         │
         ▼
┌──────────────────┐
│   🧠 Team Lead    │  Understands → Plans → Delegates → Monitors → Verifies
└────────┬─────────┘
         │
    ┌────┼────┬────────┐
    ▼    ▼    ▼        ▼
  ⚙️     🧪    🔒       📝
 Backend Test Security  Docs
    │    │    │        │
    └────┴────┴────────┘
         │
   Shared Workspace (.agentmind/)
   Tasks · Mailbox · Status
```

### The 5 Phases

1. **Onboarding** — Lead understands your request, asks clarifying questions
2. **Planning** — Decomposes into tasks with dependencies, assembles the right team
3. **Execution** — Each agent deep-researches, then implements step by step
4. **Verification** — Build, test, lint, typecheck — debug until everything passes
5. **Completion** — Summary of what was built, files changed, architecture decisions

### Agent Deep Research

Every agent **must research before coding**:
- Read existing codebase thoroughly
- Understand patterns and conventions
- Check what other agents have built
- Plan their approach step by step
- Ask questions when confused (via mailbox)

### Inter-Agent Communication

Agents talk to each other through `.agentmind/mailbox/`:

```json
{"from": "agentmind-backend", "to": "agentmind-test", "content": "Auth endpoints ready at src/routes/auth.ts. Test /register, /login, /refresh.", "type": "direct"}
```

The Lead monitors all communication, answers questions, and ensures smooth handoffs.

---

## 🎭 Available Agents

| Agent | Icon | Role | Access |
|-------|------|------|--------|
| `agentmind-lead` | 🧠 | Team Lead — orchestrates everything | Full |
| `agentmind-backend` | ⚙️ | APIs, databases, server logic, auth | Full |
| `agentmind-frontend` | 🎨 | UI components, styling, state management | Full |
| `agentmind-test` | 🧪 | Unit, integration, and e2e tests | Full |
| `agentmind-security` | 🔒 | OWASP audits, vulnerability scanning | Read-only |
| `agentmind-reviewer` | 👁️ | Code quality, patterns, readability | Read-only |
| `agentmind-devops` | 🚀 | CI/CD, Docker, deployment | Full |
| `agentmind-docs` | 📝 | README, API docs, architecture guides | Full |
| `agentmind-perf` | ⚡ | Profiling, caching, optimization | Full |

---

## 💬 Quick Start

### Claude Code
```bash
claude
# then type:
/agentmind Build a full-stack todo app with React, Express, and PostgreSQL
```

### VS Code Copilot
Open the Chat panel and type:
```
@agentmind Build a full-stack todo app with React, Express, and PostgreSQL
```

### Cursor / Windsurf
Reference `agentmind-lead` in chat:
```
@agentmind-lead Build a full-stack todo app with React, Express, and PostgreSQL
```

### What Happens Next

1. The Lead asks you to confirm the team (e.g., Backend + Frontend + Test + Security)
2. You say "yes" or adjust
3. Agents start working — each in their own session
4. They communicate, build, test, and debug collaboratively
5. Lead verifies everything passes and gives you the summary

---

## 🏗️ Architecture

```
AgentMind/
├── agents/                         # Agent definitions (markdown + YAML frontmatter)
│   ├── agentmind-lead.md           # Team Lead — the orchestrator
│   ├── agentmind-backend.md        # Backend Developer
│   ├── agentmind-frontend.md       # Frontend Developer
│   ├── agentmind-test.md           # Test Engineer
│   ├── agentmind-security.md       # Security Reviewer (read-only)
│   ├── agentmind-reviewer.md       # Code Reviewer (read-only)
│   ├── agentmind-devops.md         # DevOps Engineer
│   ├── agentmind-docs.md           # Documentation Writer
│   └── agentmind-perf.md           # Performance Optimizer
├── skills/
│   └── agentmind/
│       └── SKILL.md                # Main orchestration skill & protocol
├── install.sh                      # Unix/macOS installer
├── install.ps1                     # Windows installer
├── uninstall.sh                    # Unix/macOS uninstaller
├── uninstall.ps1                   # Windows uninstaller
├── LICENSE
└── README.md
```

### Workspace Communication Files

When agents are working, they create `.agentmind/` in your project:

```
your-project/
└── .agentmind/
    ├── tasks.json                  # Task list with statuses & dependencies
    ├── mailbox/
    │   ├── broadcast.jsonl         # Team-wide announcements
    │   ├── lead.jsonl              # Messages to the Lead
    │   ├── agentmind-backend.jsonl # Messages to Backend Dev
    │   └── ...                     # One file per agent
    └── state/
        └── team.json               # Current team roster & phase
```

---

## ⚙️ Task System

Tasks have statuses and dependency tracking:

| Status | Meaning |
|--------|---------|
| `pending` | Ready to start (no unmet dependencies) |
| `blocked` | Waiting for dependency tasks to complete |
| `in-progress` | Agent is actively working |
| `completed` | Done successfully |
| `failed` | Failed — Lead will create fix tasks |

Priorities: `critical` → `high` → `medium` → `low`

---

## 🔒 Security

- **Read-only agents**: Security Reviewer and Code Reviewer cannot modify files
- **Path traversal protection**: Agents validate file paths within the workspace
- **Dangerous command blocking**: Recursive deletes, disk format, fork bombs are blocked
- **No secrets in code**: Agents use environment variables for sensitive config

---

## 🗺️ Roadmap

- [ ] Custom agent definitions (bring your own specialist)
- [ ] Persistent team configurations across projects
- [ ] Web dashboard for monitoring agent progress
- [ ] MCP server integration for external tools
- [ ] Agent memory — learn from past projects

---

## 📄 License

[MIT](LICENSE) © 2025 AgentMind Contributors

---

## 🙏 Acknowledgments

- Inspired by [claude-seo](https://github.com/AgriciDaniel/claude-seo) for the agent/skill architecture
- The multi-agent collaboration pattern from software engineering teams
- The open-source AI tooling community
