<#
.SYNOPSIS
    Installs or updates workspace-config standards into the current repo.

.DESCRIPTION
    Pulls nathanboothe/workspace-config into the current repo as a git
    subtree under .workspace-config/, then runs Sync-WorkspaceConfig.ps1 to
    detect which language ecosystems are present and copy the matching
    files into place.

    Safe to re-run. Use -Update to pull the latest changes from
    workspace-config into an already-installed repo.

.PARAMETER RepoUrl
    URL of the workspace-config repo. Defaults to nathanboothe/workspace-config.

.PARAMETER Branch
    Branch to pull from. Defaults to main.

.PARAMETER Update
    Pull the latest workspace-config changes instead of adding it fresh.

.PARAMETER NoBackup
    Passed through to Sync-WorkspaceConfig.ps1 — skip .bak backups of
    overwritten files.

.EXAMPLE
    # First time, from the root of a target repo
    ./Install-WorkspaceConfig.ps1

.EXAMPLE
    # Pull the latest standards into a repo that already has .workspace-config/
    ./Install-WorkspaceConfig.ps1 -Update
#>
[CmdletBinding()]
param(
    [string]$RepoUrl = "https://github.com/nathanboothe/workspace-config.git",
    [string]$Branch = "main",
    [switch]$Update,
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".git")) {
    throw "Run this from the root of a git repository (the target repo, not workspace-config itself)."
}

$subtreePath = ".workspace-config"

if ($Update) {
    if (-not (Test-Path $subtreePath)) {
        throw "$subtreePath doesn't exist yet — run without -Update first."
    }
    Write-Host "Pulling latest workspace-config into $subtreePath..." -ForegroundColor Cyan
    git subtree pull --prefix=$subtreePath $RepoUrl $Branch --squash
}
elseif (Test-Path $subtreePath) {
    Write-Host "$subtreePath already exists. Use -Update to pull the latest changes." -ForegroundColor Yellow
}
else {
    Write-Host "Adding workspace-config as a subtree at $subtreePath..." -ForegroundColor Cyan
    git subtree add --prefix=$subtreePath $RepoUrl $Branch --squash
}

$syncScript = Join-Path $subtreePath "scripts/Sync-WorkspaceConfig.ps1"
if (-not (Test-Path $syncScript)) {
    throw "Sync script not found at $syncScript — subtree pull may have failed."
}

& $syncScript -NoBackup:$NoBackup
