# ──────────────────────────────────────────────────────────────
# AgentMind — One-line installer for VS Code (Windows)
#
# Usage:
#   git clone --depth 1 https://github.com/AbdulRahmanAzam/AgentMind.git
#   powershell -ExecutionPolicy Bypass -File AgentMind\install.ps1
# ──────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$VERSION = "0.1.0"
$EXT_ID = "agentmind.agentmind-$VERSION"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "     AgentMind Installer v$VERSION" -ForegroundColor Cyan
Write-Host "     Multi-Agent Orchestration for VS Code" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# ── Find the repo root (where this script lives) ────────────
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Verify required files
if (-not (Test-Path "$ScriptDir\package.json")) {
    Write-Host "Error: package.json not found in $ScriptDir" -ForegroundColor Red
    Write-Host "  Make sure you cloned the full repository."
    exit 1
}

if (-not (Test-Path "$ScriptDir\dist\extension.js")) {
    Write-Host "Error: dist\extension.js not found." -ForegroundColor Red
    Write-Host "  The pre-built extension bundle is missing."
    exit 1
}

# ── Detect VS Code variant ──────────────────────────────────
$VscodeDir = $null
$VscodeName = $null

$Candidates = @(
    @{ Path = "$env:USERPROFILE\.vscode-insiders\extensions"; Name = "VS Code Insiders" },
    @{ Path = "$env:USERPROFILE\.vscode\extensions"; Name = "VS Code" }
)

foreach ($c in $Candidates) {
    if (Test-Path $c.Path) {
        $VscodeDir = $c.Path
        $VscodeName = $c.Name
        break
    }
}

if (-not $VscodeDir) {
    Write-Host "Error: Could not find VS Code extensions directory." -ForegroundColor Red
    Write-Host "  Checked:"
    Write-Host "    $env:USERPROFILE\.vscode\extensions"
    Write-Host "    $env:USERPROFILE\.vscode-insiders\extensions"
    Write-Host ""
    Write-Host "  Make sure VS Code is installed."
    exit 1
}

Write-Host "Detected: $VscodeName" -ForegroundColor Blue
Write-Host "Extensions dir: $VscodeDir" -ForegroundColor Blue
Write-Host ""

# ── Remove old version if exists ─────────────────────────────
$TargetDir = Join-Path $VscodeDir $EXT_ID

if (Test-Path $TargetDir) {
    Write-Host "Removing previous installation..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $TargetDir
}

# ── Install ──────────────────────────────────────────────────
Write-Host "Installing AgentMind to $TargetDir" -ForegroundColor Blue

New-Item -ItemType Directory -Path "$TargetDir\dist" -Force | Out-Null

# Copy only what the extension needs (no node_modules, no src)
Copy-Item "$ScriptDir\package.json" "$TargetDir\"
Copy-Item "$ScriptDir\dist\extension.js" "$TargetDir\dist\"

if (Test-Path "$ScriptDir\LICENSE") {
    Copy-Item "$ScriptDir\LICENSE" "$TargetDir\"
}
if (Test-Path "$ScriptDir\README.md") {
    Copy-Item "$ScriptDir\README.md" "$TargetDir\"
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "     AgentMind installed successfully!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "How to use:" -ForegroundColor Cyan
Write-Host "  1. Reload VS Code (Ctrl+Shift+P -> 'Reload Window')"
Write-Host "  2. Open Chat panel (Ctrl+I)"
Write-Host "  3. Type: @agentmind build a REST API"
Write-Host ""
Write-Host "Commands:" -ForegroundColor Cyan
Write-Host "  @agentmind <request>   - Start a new task"
Write-Host "  @agentmind /plan       - Create plan without starting"
Write-Host "  @agentmind /status     - Show team progress"
Write-Host "  @agentmind /stop       - Stop all agents"
Write-Host ""
Write-Host "Note: You may need to restart VS Code for the extension to appear." -ForegroundColor Yellow
Write-Host ""
