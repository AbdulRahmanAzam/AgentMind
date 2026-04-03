#!/usr/bin/env bash
# AgentMind — Universal Uninstaller
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${YELLOW}AgentMind — Uninstaller${NC}"
echo ""

removed=0

remove_from() {
    local agent_dir="$1"
    local skill_dir="$2"
    local ide_name="$3"

    local found=0

    # Remove agent files (.agent.md and legacy .md)
    for f in "${agent_dir}"/agentmind-*.agent.md; do
        if [ -f "$f" ]; then
            rm -f "$f"
            found=1
        fi
    done
    for f in "${agent_dir}"/agentmind-*.md; do
        if [ -f "$f" ]; then
            rm -f "$f"
            found=1
        fi
    done

    # Remove skill directory
    if [ -d "${skill_dir}/agentmind" ]; then
        rm -rf "${skill_dir}/agentmind"
        found=1
    fi

    if [ "$found" -eq 1 ]; then
        echo -e "  ${GREEN}✓${NC} Removed from ${ide_name}"
        removed=$((removed + 1))
    fi
}

# Claude Code
remove_from "${HOME}/.claude/agents" "${HOME}/.claude/skills" "Claude Code"

# VS Code Insiders / VS Code (user profile prompts)
if [[ "$OSTYPE" == "darwin"* ]]; then
    VSCODE_DATA="${HOME}/Library/Application Support"
else
    VSCODE_DATA="${HOME}/.config"
fi
remove_from "${VSCODE_DATA}/Code - Insiders/User/prompts" "${HOME}/.agents/skills" "VS Code Insiders"
remove_from "${VSCODE_DATA}/Code/User/prompts" "${HOME}/.agents/skills" "VS Code"
# Also clean legacy paths
remove_from "${HOME}/.vscode-insiders/agents" "${HOME}/.vscode-insiders/skills" "VS Code Insiders (legacy)"
remove_from "${HOME}/.vscode/agents" "${HOME}/.vscode/skills" "VS Code (legacy)"

# Cursor
remove_from "${HOME}/.cursor/agents" "${HOME}/.cursor/skills" "Cursor"

# Windsurf
remove_from "${HOME}/.codeium/windsurf/agents" "${HOME}/.codeium/windsurf/skills" "Windsurf"
remove_from "${HOME}/.windsurf/agents" "${HOME}/.windsurf/skills" "Windsurf (alt)"

# Also remove old VS Code extension install if present
for ext_dir in "${HOME}/.vscode/extensions" "${HOME}/.vscode-insiders/extensions" "${HOME}/.vscode-oss/extensions"; do
    if [ -d "${ext_dir}/agentmind.agentmind-"* ] 2>/dev/null; then
        rm -rf "${ext_dir}"/agentmind.agentmind-*
        echo -e "  ${GREEN}✓${NC} Removed old VS Code extension from ${ext_dir}"
        removed=$((removed + 1))
    fi
done

echo ""
if [ "$removed" -gt 0 ]; then
    echo -e "${GREEN}✓ AgentMind uninstalled successfully.${NC}"
else
    echo -e "${YELLOW}No AgentMind installation found.${NC}"
fi
