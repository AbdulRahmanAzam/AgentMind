#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# AgentMind — Uninstaller
#
# Usage:
#   bash AgentMind/uninstall.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="0.1.0"
EXT_ID="agentmind.agentmind-${VERSION}"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}🧠 AgentMind Uninstaller${NC}"
echo ""

REMOVED=0

for DIR in "${HOME}/.vscode/extensions" "${HOME}/.vscode-insiders/extensions" "${HOME}/.vscode-oss/extensions"; do
    TARGET="${DIR}/${EXT_ID}"
    if [ -d "${TARGET}" ]; then
        echo -e "${BLUE}→ Removing ${TARGET}${NC}"
        rm -rf "${TARGET}"
        REMOVED=1
    fi
done

if [ "${REMOVED}" -eq 1 ]; then
    echo ""
    echo -e "${GREEN}✓ AgentMind uninstalled. Reload VS Code to complete.${NC}"
else
    echo -e "${RED}✗ AgentMind not found in any VS Code extensions directory.${NC}"
fi
echo ""
