param(
  [string]$RemoteName = "origin",
  [string]$BranchName,
  [string]$CommitPrefix = "backup: auto snapshot"
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Write-Section($Text) {
  Write-Host ""
  Write-Host "== $Text =="
}

function Get-TrackedFileStats {
  param([string[]]$Paths)

  $stats = New-Object System.Collections.Generic.List[object]
  foreach ($path in $Paths) {
    if (-not $path) {
      continue
    }

    if (Test-Path -LiteralPath $path -PathType Leaf) {
      $item = Get-Item -LiteralPath $path -Force
      $stats.Add([PSCustomObject]@{
        Path = $path
        SizeBytes = [int64]$item.Length
      })
    }
  }

  return $stats
}

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
  Write-Host "[FAIL] Current directory is not inside a Git worktree."
  exit 1
}

Set-Location $repoRoot

if (-not $BranchName) {
  $BranchName = (git branch --show-current).Trim()
}

if (-not $BranchName) {
  Write-Host "[FAIL] Could not determine current branch."
  exit 1
}

$remoteUrl = (git remote get-url $RemoteName 2>$null).Trim()
if (-not $remoteUrl) {
  Write-Host "[FAIL] Remote '$RemoteName' is not configured."
  exit 1
}

Write-Section "Repository"
Write-Host "Root:   $repoRoot"
Write-Host "Remote: $RemoteName -> $remoteUrl"
Write-Host "Branch: $BranchName"

Write-Section "Status Before"
git status --short --branch

$beforeStatus = & git status --porcelain=v1
if (-not $beforeStatus) {
  Write-Host "No changes detected. Nothing to back up."
  exit 0
}

Write-Section "Stage Changes"
git add -A

$hasStagedChanges = $true
& git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  $hasStagedChanges = $false
}

if (-not $hasStagedChanges) {
  Write-Host "Changes were detected, but nothing became staged after .gitignore rules."
  exit 0
}

$raw = & git diff --cached --name-only -z
$stagedPaths = @()
if ($raw) {
  $stagedPaths = ($raw -split "`0") | Where-Object { $_ -ne "" }
}

$stats = Get-TrackedFileStats -Paths $stagedPaths
$totalBytes = 0
if ($stats.Count -gt 0) {
  $totalBytes = ($stats | Measure-Object -Property SizeBytes -Sum).Sum
}
$totalMB = [Math]::Round($totalBytes / 1MB, 2)

Write-Section "Staged Summary"
Write-Host "Files: $($stagedPaths.Count)"
Write-Host "Size:  $totalMB MB"
git diff --cached --stat

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$commitMessage = "$CommitPrefix $timestamp"

Write-Section "Commit"
git commit -m $commitMessage

Write-Section "Push"
git push $RemoteName $BranchName

Write-Section "Done"
git log -1 --oneline
