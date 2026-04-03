# 🧠 AgentMind

**Collaborative multi-agent orchestration for VS Code**

AgentMind transforms your VS Code into a collaborative AI workspace where multiple specialized agents work together on complex tasks — planning, coding, reviewing, and documenting — all coordinated by an intelligent Team Lead.

---

## ✨ Features

- **Multi-Agent Teams** — Spin up a team of 2–5 AI agents, each with a distinct role (Backend Dev, Frontend Dev, Test Engineer, Security Reviewer, and more).
- **Intelligent Task Planning** — The Team Lead decomposes your request into tasks, assigns them based on expertise, and monitors progress.
- **File-Safe Collaboration** — Lock-based concurrency ensures agents never overwrite each other's work.
- **Inter-Agent Messaging** — Agents communicate through a JSONL mailbox with direct messages, broadcasts, and system notifications.
- **Dependency-Aware Tasks** — Tasks can declare dependencies; blocked tasks are automatically unblocked when prerequisites complete.
- **Built-In Security** — Path traversal protection, dangerous command blocking, and read-only roles for reviewers.
- **Live Terminal Output** — Each agent gets its own pseudoterminal so you can watch progress in real time.
- **Onboarding Flow** — A guided setup picks team size and roles via the VS Code chat interface.

---

## 🚀 Quick Start

### Prerequisites

- **VS Code** 1.96.0 or later (Insiders recommended for latest Chat API)
- **Node.js** 18+ and **npm**
- A language model available via the VS Code Language Model API (e.g., GitHub Copilot)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/your-org/agentmind.git
cd agentmind

# Install dependencies
npm install

# Compile the extension
npm run compile

# Open in VS Code and press F5 to launch the Extension Development Host
code .
```

### First Use

1. Open the **Chat** panel in VS Code.
2. Type `@agentmind` followed by your request, e.g.:

   ```
   @agentmind Build a REST API with authentication and tests
   ```

3. The onboarding flow will ask you to select a team size and roles.
4. Watch agents collaborate in their dedicated terminals!

---

## 🏗️ How It Works

```
User Request
     │
     ▼
┌──────────┐     ┌─────────────┐
│ Onboarding│────▶│  Team Lead   │
│   Flow    │     │ (5 phases)   │
└──────────┘     └──────┬──────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │ Agent 1  │    │ Agent 2  │    │ Agent 3  │
   │ Backend  │    │ Frontend │    │  Tests   │
   └─────────┘    └─────────┘    └─────────┘
        │               │               │
        └───────── Shared State ────────┘
              (Tasks · Mailbox · Locks)
```

**Team Lead Phases:**

1. **Plan** — Decompose the request into a task graph.
2. **Assign** — Match tasks to the best-suited agents.
3. **Monitor** — Track progress, handle failures, rebalance if needed.
4. **Verify** — Ensure all tasks are complete and compile/test checks pass.
5. **Complete** — Summarize results and report back to the user.

---

## 🎭 Agent Roles

| Role | Icon | Description |
|------|------|-------------|
| Backend Developer | ⚙️ | APIs, databases, server logic |
| Frontend Developer | 🎨 | UI components, styling, accessibility |
| Test Engineer | 🧪 | Unit, integration, and e2e tests |
| Security Reviewer | 🔒 | OWASP Top 10 audits (read-only) |
| Code Reviewer | 👁️ | Quality, patterns, readability (read-only) |
| DevOps Engineer | 🚀 | CI/CD, Docker, deployment |
| Doc Writer | 📝 | README, API docs, guides |
| Perf Optimizer | ⚡ | Profiling, caching, bundle size |

You can also define **custom roles** or let the **Lead Decide** the best fit.

---

## ⚙️ Configuration

Configure via VS Code settings (`Ctrl+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `agentmind.defaultTeamSize` | `3` | Default number of agents |
| `agentmind.maxAgents` | `5` | Maximum agents allowed |
| `agentmind.heartbeatIntervalMs` | `10000` | Heartbeat ping interval (ms) |
| `agentmind.taskTimeoutMs` | `300000` | Task timeout (ms) |

---

## 📁 Architecture

```
src/
├── communication/       # Lock manager, task list, mailbox
│   ├── lockManager.ts   # proper-lockfile based mutual exclusion
│   ├── taskList.ts      # JSON-file task CRUD with dependency graph
│   └── mailbox.ts       # JSONL append-log messaging
├── llm/                 # Language model integration
│   ├── modelAccess.ts   # Agent loop with tool calling
│   ├── toolDefinitions.ts
│   └── agentPrompts.ts
├── orchestrator/        # Execution engine
│   ├── taskPlanner.ts   # LLM-powered task decomposition
│   ├── teammate.ts      # Autonomous agent loop
│   ├── agentManager.ts  # Agent lifecycle & monitoring
│   └── teamLead.ts      # 5-phase team coordination
├── participant/         # VS Code Chat Participants API
│   ├── handler.ts       # Chat request handler
│   └── onboarding.ts    # Guided team setup
├── roles/
│   └── presets.ts       # 8 built-in role definitions
├── storage/
│   ├── workspace.ts     # .agentmind/ directory management
│   └── agentmindMd.ts   # Project context generation
├── terminal/
│   ├── formatter.ts     # ANSI terminal output
│   └── agentTerminal.ts # Pseudoterminal per agent
├── tools/
│   ├── fileTools.ts     # Read/write/edit/search files
│   ├── terminalTools.ts # Shell command execution
│   └── codeTools.ts     # Diagnostics & symbol info
├── utils/
│   ├── logger.ts
│   └── ids.ts
├── types.ts
└── extension.ts         # Activation & registration
```

---

## 🧑‍💻 Development

```bash
# Install dependencies
npm install

# Compile (esbuild)
npm run compile

# Type-check
npx tsc --noEmit

# Run tests
npm test

# Run tests with coverage
npx vitest run --coverage

# Watch mode
npm run watch
```

### Running in VS Code

1. Open the project in VS Code.
2. Press **F5** to launch the Extension Development Host.
3. In the new window, open the Chat panel and type `@agentmind`.

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository and create a feature branch.
2. **Write tests** for new functionality (aim for ≥80% coverage).
3. **Run** `npm test` and `npx tsc --noEmit` before submitting.
4. **Open a Pull Request** with a clear description of your changes.

### Code Style

- TypeScript strict mode
- ESM imports with `.js` extensions
- Prefer `async/await` over raw Promises
- Use `LockManager.withLock()` for all shared file access

---

## 🗺️ Roadmap

- [ ] Agent-to-agent code review handoff
- [ ] Custom tool plugins
- [ ] Persistent team configurations
- [ ] Web UI dashboard for team monitoring
- [ ] Support for additional LLM providers
- [ ] Task priority rebalancing during execution

---

## 📄 License

[MIT](LICENSE) © 2025 AgentMind Contributors

---

## 🙏 Acknowledgments

- [VS Code Chat Participants API](https://code.visualstudio.com/api/extension-guides/chat)
- [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- [proper-lockfile](https://github.com/moxystudio/node-proper-lockfile) for cross-platform file locking
- The open-source community for inspiration and feedback
