#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# AgentMind — Universal Installer
# Installs multi-agent orchestration for ALL AI-powered IDEs
#
# Usage:
#   git clone --depth 1 https://github.com/AbdulRahmanAzam/AgentMind.git && bash AgentMind/install.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="2.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALLED=()

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   🧠 AgentMind v${VERSION} — Universal Installer          ║${NC}"
echo -e "${CYAN}║   Multi-Agent Orchestration for ANY AI IDE           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Verify repo files exist ──────────────────────────────────
if [ ! -d "${SCRIPT_DIR}/agents" ] || [ ! -d "${SCRIPT_DIR}/skills" ]; then
    echo -e "${RED}✗ Error: agents/ or skills/ directory not found in ${SCRIPT_DIR}${NC}"
    echo "  Make sure you cloned the full repository."
    exit 1
fi

# ── Helper: install agents + skills to a target directory ─────
install_to() {
    local agent_dir="$1"
    local skill_dir="$2"
    local ide_name="$3"

    mkdir -p "${agent_dir}"
    mkdir -p "${skill_dir}/agentmind"

    # Copy agent files
    cp "${SCRIPT_DIR}"/agents/agentmind-*.md "${agent_dir}/" 2>/dev/null || true

    # Copy skill files
    cp -r "${SCRIPT_DIR}"/skills/agentmind/* "${skill_dir}/agentmind/" 2>/dev/null || true

    INSTALLED+=("${ide_name}")
    echo -e "  ${GREEN}✓${NC} ${ide_name}"
    echo -e "    Agents → ${agent_dir}"
    echo -e "    Skills → ${skill_dir}/agentmind/"
}

# ── Detect and install for each IDE ──────────────────────────
echo -e "${BLUE}→ Detecting AI IDEs...${NC}"
echo ""

# 1. Claude Code (~/.claude/agents/ + ~/.claude/skills/)
if [ -d "${HOME}/.claude" ] || command -v claude >/dev/null 2>&1; then
    install_to "${HOME}/.claude/agents" "${HOME}/.claude/skills" "Claude Code"
else
    # Install anyway — user might install Claude Code later
    install_to "${HOME}/.claude/agents" "${HOME}/.claude/skills" "Claude Code (pre-installed)"
fi

# 2. VS Code / Copilot (~/.vscode/agents/ or ~/.vscode-insiders/agents/)
if [ -d "${HOME}/.vscode-insiders" ]; then
    install_to "${HOME}/.vscode-insiders/agents" "${HOME}/.vscode-insiders/skills" "VS Code Insiders"
fi
if [ -d "${HOME}/.vscode" ]; then
    install_to "${HOME}/.vscode/agents" "${HOME}/.vscode/skills" "VS Code"
fi

# 3. Cursor (~/.cursor/agents/)
if [ -d "${HOME}/.cursor" ]; then
    install_to "${HOME}/.cursor/agents" "${HOME}/.cursor/skills" "Cursor"
fi

# 4. Windsurf (~/.codeium/windsurf/agents/)
if [ -d "${HOME}/.codeium/windsurf" ]; then
    install_to "${HOME}/.codeium/windsurf/agents" "${HOME}/.codeium/windsurf/skills" "Windsurf"
elif [ -d "${HOME}/.windsurf" ]; then
    install_to "${HOME}/.windsurf/agents" "${HOME}/.windsurf/skills" "Windsurf"
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
if [ ${#INSTALLED[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠  No AI IDEs detected. Installed to Claude Code directory by default.${NC}"
    install_to "${HOME}/.claude/agents" "${HOME}/.claude/skills" "Claude Code (default)"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓ AgentMind installed successfully!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Installed for: ${INSTALLED[*]}${NC}"
echo ""
echo -e "${CYAN}How to use:${NC}"
echo ""
echo "  Claude Code:     claude → /agentmind Build a REST API with auth"
echo "  VS Code Copilot: @agentmind Build a REST API with auth"
echo "  Cursor:          mention agentmind-lead in chat"
echo "  Windsurf:        mention agentmind-lead in Cascade"
echo ""
echo -e "${CYAN}Available agents:${NC}"
echo "  agentmind-lead      Team Lead (orchestrator)"
echo "  agentmind-backend   Backend Developer"
echo "  agentmind-frontend  Frontend Developer"
echo "  agentmind-test      Test Engineer"
echo "  agentmind-security  Security Reviewer"
echo "  agentmind-reviewer  Code Reviewer"
echo "  agentmind-devops    DevOps Engineer"
echo "  agentmind-docs      Documentation Writer"
echo "  agentmind-perf      Performance Optimizer"
echo ""
echo -e "To uninstall: ${YELLOW}bash AgentMind/uninstall.sh${NC}"
