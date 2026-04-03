# ──────────────────────────────────────────────────────────────
# AgentMind — Uninstaller (Windows)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File AgentMind\uninstall.ps1
# ──────────────────────────────────────────────────────────────

$VERSION = "0.1.0"
$EXT_ID = "agentmind.agentmind-$VERSION"

Write-Host ""
Write-Host "AgentMind Uninstaller" -ForegroundColor Cyan
Write-Host ""

$Removed = $false

$Dirs = @(
    "$env:USERPROFILE\.vscode\extensions",
    "$env:USERPROFILE\.vscode-insiders\extensions"
)

foreach ($Dir in $Dirs) {
    $Target = Join-Path $Dir $EXT_ID
    if (Test-Path $Target) {
        Write-Host "Removing $Target" -ForegroundColor Blue
        Remove-Item -Recurse -Force $Target
        $Removed = $true
    }
}

if ($Removed) {
    Write-Host ""
    Write-Host "AgentMind uninstalled. Reload VS Code to complete." -ForegroundColor Green
} else {
    Write-Host "AgentMind not found in any VS Code extensions directory." -ForegroundColor Red
}
Write-Host ""
