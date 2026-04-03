# ──────────────────────────────────────────────────────────────
# AgentMind — Universal Installer (Windows PowerShell)
# Installs multi-agent orchestration for ALL AI-powered IDEs
#
# Usage:
#   git clone --depth 1 https://github.com/AbdulRahmanAzam/AgentMind.git
#   powershell -ExecutionPolicy Bypass -File AgentMind\install.ps1
# ──────────────────────────────────────────────────────────────

$Version = "2.0.0"
$ScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
$Installed = @()

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  AgentMind v$Version - Universal Installer" -ForegroundColor Cyan
Write-Host "  Multi-Agent Orchestration for ANY AI IDE" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# Verify repo files exist
if (-not (Test-Path "$ScriptDir\agents") -or -not (Test-Path "$ScriptDir\skills")) {
    Write-Host "Error: agents\ or skills\ directory not found in $ScriptDir" -ForegroundColor Red
    Write-Host "  Make sure you cloned the full repository."
    exit 1
}

# Helper function
function Install-To {
    param(
        [string]$AgentDir,
        [string]$SkillDir,
        [string]$IdeName
    )

    New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
    New-Item -ItemType Directory -Force -Path "$SkillDir\agentmind" | Out-Null

    # Copy agent files
    Get-ChildItem -Path "$ScriptDir\agents\agentmind-*.md" -ErrorAction SilentlyContinue | Copy-Item -Destination $AgentDir -Force

    # Copy skill files
    if (Test-Path "$ScriptDir\skills\agentmind") {
        Copy-Item "$ScriptDir\skills\agentmind\*" -Destination "$SkillDir\agentmind\" -Recurse -Force
    }

    $script:Installed += $IdeName
    Write-Host "  [OK] $IdeName" -ForegroundColor Green
    Write-Host "    Agents -> $AgentDir"
    Write-Host "    Skills -> $SkillDir\agentmind\"
}

Write-Host "Detecting AI IDEs..." -ForegroundColor Blue
Write-Host ""

$UserHome = $env:USERPROFILE

# 1. Claude Code
$ClaudeDir = "$UserHome\.claude"
Install-To "$ClaudeDir\agents" "$ClaudeDir\skills" "Claude Code"

# 2. VS Code Insiders
if (Test-Path "$UserHome\.vscode-insiders") {
    Install-To "$UserHome\.vscode-insiders\agents" "$UserHome\.vscode-insiders\skills" "VS Code Insiders"
}

# 3. VS Code
if (Test-Path "$UserHome\.vscode") {
    Install-To "$UserHome\.vscode\agents" "$UserHome\.vscode\skills" "VS Code"
}

# 4. Cursor
if (Test-Path "$UserHome\.cursor") {
    Install-To "$UserHome\.cursor\agents" "$UserHome\.cursor\skills" "Cursor"
}

# 5. Windsurf
if (Test-Path "$UserHome\.codeium\windsurf") {
    Install-To "$UserHome\.codeium\windsurf\agents" "$UserHome\.codeium\windsurf\skills" "Windsurf"
} elseif (Test-Path "$UserHome\.windsurf") {
    Install-To "$UserHome\.windsurf\agents" "$UserHome\.windsurf\skills" "Windsurf"
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  AgentMind installed successfully!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Installed for: $($Installed -join ', ')" -ForegroundColor Blue
Write-Host ""
Write-Host "How to use:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Claude Code:     claude -> /agentmind Build a REST API"
Write-Host "  VS Code Copilot: @agentmind Build a REST API"
Write-Host "  Cursor:          mention agentmind-lead in chat"
Write-Host "  Windsurf:        mention agentmind-lead in Cascade"
Write-Host ""
Write-Host "Available agents:" -ForegroundColor Cyan
Write-Host "  agentmind-lead      Team Lead (orchestrator)"
Write-Host "  agentmind-backend   Backend Developer"
Write-Host "  agentmind-frontend  Frontend Developer"
Write-Host "  agentmind-test      Test Engineer"
Write-Host "  agentmind-security  Security Reviewer"
Write-Host "  agentmind-reviewer  Code Reviewer"
Write-Host "  agentmind-devops    DevOps Engineer"
Write-Host "  agentmind-docs      Documentation Writer"
Write-Host "  agentmind-perf      Performance Optimizer"
Write-Host ""
Write-Host "To uninstall: powershell -ExecutionPolicy Bypass -File AgentMind\uninstall.ps1" -ForegroundColor Yellow
