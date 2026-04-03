#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# AgentMind — One-line installer for VS Code
#
# Usage:
#   git clone --depth 1 https://github.com/AbdulRahmanAzam/AgentMind.git
#   bash AgentMind/install.sh
#
# Or one-liner:
#   git clone --depth 1 https://github.com/AbdulRahmanAzam/AgentMind.git && bash AgentMind/install.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

VERSION="0.1.0"
EXT_ID="agentmind.agentmind-${VERSION}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🧠 AgentMind Installer v${VERSION}            ║${NC}"
echo -e "${BLUE}║     Multi-Agent Orchestration for VS Code    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Find the repo root (where this script lives) ────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Verify we have the required files
if [ ! -f "${SCRIPT_DIR}/package.json" ]; then
    echo -e "${RED}✗ Error: package.json not found in ${SCRIPT_DIR}${NC}"
    echo "  Make sure you cloned the full repository."
    exit 1
fi

if [ ! -f "${SCRIPT_DIR}/dist/extension.js" ]; then
    echo -e "${RED}✗ Error: dist/extension.js not found.${NC}"
    echo "  The pre-built extension bundle is missing."
    exit 1
fi

# ── Detect VS Code variant ──────────────────────────────────
VSCODE_DIR=""
VSCODE_NAME=""

if [ -d "${HOME}/.vscode-insiders/extensions" ]; then
    VSCODE_DIR="${HOME}/.vscode-insiders/extensions"
    VSCODE_NAME="VS Code Insiders"
elif [ -d "${HOME}/.vscode/extensions" ]; then
    VSCODE_DIR="${HOME}/.vscode/extensions"
    VSCODE_NAME="VS Code"
elif [ -d "${HOME}/.vscode-oss/extensions" ]; then
    VSCODE_DIR="${HOME}/.vscode-oss/extensions"
    VSCODE_NAME="VS Code OSS"
else
    echo -e "${RED}✗ Error: Could not find VS Code extensions directory.${NC}"
    echo "  Checked:"
    echo "    ~/.vscode/extensions"
    echo "    ~/.vscode-insiders/extensions"
    echo "    ~/.vscode-oss/extensions"
    echo ""
    echo "  Make sure VS Code is installed."
    exit 1
fi

echo -e "${BLUE}→ Detected: ${VSCODE_NAME}${NC}"
echo -e "${BLUE}→ Extensions dir: ${VSCODE_DIR}${NC}"
echo ""

# ── Remove old version if exists ─────────────────────────────
OLD_DIR="${VSCODE_DIR}/${EXT_ID}"
if [ -d "${OLD_DIR}" ]; then
    echo -e "${YELLOW}→ Removing previous installation...${NC}"
    rm -rf "${OLD_DIR}"
fi

# ── Install ──────────────────────────────────────────────────
TARGET_DIR="${VSCODE_DIR}/${EXT_ID}"

echo -e "${BLUE}→ Installing AgentMind to ${TARGET_DIR}${NC}"

mkdir -p "${TARGET_DIR}/dist"

# Copy only what the extension needs (no node_modules, no src)
cp "${SCRIPT_DIR}/package.json" "${TARGET_DIR}/"
cp "${SCRIPT_DIR}/dist/extension.js" "${TARGET_DIR}/dist/"
cp "${SCRIPT_DIR}/LICENSE" "${TARGET_DIR}/" 2>/dev/null || true
cp "${SCRIPT_DIR}/README.md" "${TARGET_DIR}/" 2>/dev/null || true

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✓ AgentMind installed successfully!      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}How to use:${NC}"
echo "  1. Reload VS Code (Ctrl+Shift+P → 'Reload Window')"
echo "  2. Open Chat panel (Ctrl+I)"
echo "  3. Type: @agentmind build a REST API"
echo ""
echo -e "${BLUE}Commands:${NC}"
echo "  @agentmind <request>   — Start a new task"
echo "  @agentmind /plan       — Create plan without starting"
echo "  @agentmind /status     — Show team progress"
echo "  @agentmind /stop       — Stop all agents"
echo ""
echo -e "${YELLOW}Note: You may need to restart VS Code for the extension to appear.${NC}"
echo ""
