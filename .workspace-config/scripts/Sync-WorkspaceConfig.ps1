<#
.SYNOPSIS
    Detects which language ecosystems exist in the current repo and copies
    the matching workspace-config files into place at their expected paths.

.DESCRIPTION
    Reads .workspace-config/manifest.json, walks the repo (excluding the
    .workspace-config folder itself) looking for files matching each
    ecosystem's detectPatterns, and copies the associated files from
    .workspace-config/ to their destination paths at the repo root or under
    .github/workflows/.

    Existing destination files are backed up to <file>.bak before being
    overwritten, unless -NoBackup is passed.

.PARAMETER NoBackup
    Skip creating .bak copies of files that already exist at the destination.

.EXAMPLE
    ./.workspace-config/scripts/Sync-WorkspaceConfig.ps1
#>
[CmdletBinding()]
param(
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$root = git rev-parse --show-toplevel 2>$null
if (-not $root) {
    throw "Not inside a git repository. Run this from within a target repo."
}
$root = $root.Trim()
Set-Location $root

$configRoot = Join-Path $root ".workspace-config"
$manifestPath = Join-Path $configRoot "manifest.json"
if (-not (Test-Path $manifestPath)) {
    throw "manifest.json not found at $manifestPath — did the subtree add/pull run correctly?"
}
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

function Test-EcosystemPresent {
    param([string[]]$Patterns)

    foreach ($pattern in $Patterns) {
        $hit = Get-ChildItem -Path $root -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch [regex]::Escape([IO.Path]::Combine($root, '.workspace-config')) } |
            Select-Object -First 1
        if ($hit) { return $true }
    }
    return $false
}

function Copy-ConfigFile {
    param(
        [string]$SourceRelative,
        [string]$DestRelative
    )

    $source = Join-Path $configRoot $SourceRelative
    $dest = Join-Path $root $DestRelative

    if (-not (Test-Path $source)) {
        Write-Warning "Source missing, skipping: $SourceRelative"
        return
    }

    $destDir = Split-Path $dest -Parent
    if ($destDir -and -not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    if ((Test-Path $dest) -and -not $NoBackup) {
        Copy-Item $dest "$dest.bak" -Force
    }

    Copy-Item $source $dest -Force
    Write-Host "  wrote $DestRelative" -ForegroundColor DarkGray
}

Write-Host "Applying always-on config..." -ForegroundColor Cyan
foreach ($item in $manifest.alwaysCopy) {
    Copy-ConfigFile -SourceRelative $item.source -DestRelative $item.dest
}

foreach ($prop in $manifest.ecosystems.PSObject.Properties) {
    $name = $prop.Name
    $def = $prop.Value
    if (Test-EcosystemPresent -Patterns $def.detectPatterns) {
        Write-Host "Detected '$name' — applying config" -ForegroundColor Green
        foreach ($file in $def.files) {
            Copy-ConfigFile -SourceRelative $file.source -DestRelative $file.dest
        }
    }
    else {
        Write-Verbose "No '$name' files detected — skipping"
    }
}

Write-Host ""
Write-Host "Done. Review with 'git status' before committing." -ForegroundColor Cyan
if (Test-Path (Join-Path $root ".pre-commit-config.yaml")) {
    Write-Host "Run 'pre-commit install' once (requires pip/pipx install pre-commit)." -ForegroundColor Cyan
}
