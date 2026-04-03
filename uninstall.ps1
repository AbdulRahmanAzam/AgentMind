# AgentMind — Universal Uninstaller (Windows PowerShell)

Write-Host ""
Write-Host "AgentMind - Uninstaller" -ForegroundColor Yellow
Write-Host ""

$Removed = 0
$UserHome = $env:USERPROFILE

function Remove-From {
    param(
        [string]$AgentDir,
        [string]$SkillDir,
        [string]$IdeName
    )

    $Found = $false

    # Remove agent files (.agent.md and legacy .md)
    if (Test-Path $AgentDir) {
        $AgentFiles = Get-ChildItem -Path $AgentDir -Filter "agentmind-*.agent.md" -ErrorAction SilentlyContinue
        foreach ($f in $AgentFiles) {
            Remove-Item $f.FullName -Force
            $Found = $true
        }
        # Also clean up legacy .md files
        $LegacyFiles = Get-ChildItem -Path $AgentDir -Filter "agentmind-*.md" -ErrorAction SilentlyContinue
        foreach ($f in $LegacyFiles) {
            Remove-Item $f.FullName -Force
            $Found = $true
        }
    }

    # Remove skill directory
    if (Test-Path "$SkillDir\agentmind") {
        Remove-Item "$SkillDir\agentmind" -Recurse -Force
        $Found = $true
    }

    if ($Found) {
        Write-Host "  [OK] Removed from $IdeName" -ForegroundColor Green
        $script:Removed++
    }
}

$AppData = $env:APPDATA

# Claude Code
Remove-From "$UserHome\.claude\agents" "$UserHome\.claude\skills" "Claude Code"

# VS Code Insiders (user profile prompts)
Remove-From "$AppData\Code - Insiders\User\prompts" "$UserHome\.agents\skills" "VS Code Insiders"
# Also clean legacy path
Remove-From "$UserHome\.vscode-insiders\agents" "$UserHome\.vscode-insiders\skills" "VS Code Insiders (legacy)"

# VS Code (user profile prompts)
Remove-From "$AppData\Code\User\prompts" "$UserHome\.agents\skills" "VS Code"
# Also clean legacy path
Remove-From "$UserHome\.vscode\agents" "$UserHome\.vscode\skills" "VS Code (legacy)"

# Cursor
Remove-From "$UserHome\.cursor\agents" "$UserHome\.cursor\skills" "Cursor"

# Windsurf
Remove-From "$UserHome\.codeium\windsurf\agents" "$UserHome\.codeium\windsurf\skills" "Windsurf"
Remove-From "$UserHome\.windsurf\agents" "$UserHome\.windsurf\skills" "Windsurf (alt)"

# Also remove old VS Code extension install if present
foreach ($ExtDir in @("$UserHome\.vscode\extensions", "$UserHome\.vscode-insiders\extensions", "$UserHome\.vscode-oss\extensions")) {
    if (Test-Path $ExtDir) {
        $OldExt = Get-ChildItem -Path $ExtDir -Directory -Filter "agentmind.agentmind-*" -ErrorAction SilentlyContinue
        foreach ($d in $OldExt) {
            Remove-Item $d.FullName -Recurse -Force
            Write-Host "  [OK] Removed old VS Code extension from $ExtDir" -ForegroundColor Green
            $Removed++
        }
    }
}

Write-Host ""
if ($Removed -gt 0) {
    Write-Host "AgentMind uninstalled successfully." -ForegroundColor Green
} else {
    Write-Host "No AgentMind installation found." -ForegroundColor Yellow
}
