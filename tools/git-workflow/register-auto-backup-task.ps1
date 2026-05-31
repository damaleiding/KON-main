param(
  [string]$TaskName = "KVA Auto Backup",
  [string]$StartTime = "21:00"
)

$ErrorActionPreference = "Stop"

function Write-Section($Text) {
  Write-Host ""
  Write-Host "== $Text =="
}

if ($StartTime -notmatch '^(?:[01]\d|2[0-3]):[0-5]\d$') {
  Write-Host "[FAIL] StartTime must use HH:mm format, for example 21:00."
  exit 1
}

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
  Write-Host "[FAIL] Current directory is not inside a Git worktree."
  exit 1
}

Set-Location $repoRoot

$scriptPath = Join-Path $repoRoot "tools\git-workflow\auto-backup.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  Write-Host "[FAIL] Backup script not found: $scriptPath"
  exit 1
}

$powershellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path -LiteralPath $powershellExe)) {
  $powershellExe = "powershell.exe"
}

$taskCommand = '"' + $powershellExe + '" -NoProfile -ExecutionPolicy Bypass -File "' + $scriptPath + '"'

Write-Section "Task Settings"
Write-Host "Task:  $TaskName"
Write-Host "Time:  Every 2 days at $StartTime"
Write-Host "Run:   $taskCommand"

schtasks.exe /Create /SC DAILY /MO 2 /TN $TaskName /TR $taskCommand /ST $StartTime /F | Out-Host

Write-Section "Task Created"
schtasks.exe /Query /TN $TaskName /V /FO LIST | Out-Host

Write-Host ""
Write-Host "To run it immediately:"
Write-Host ('schtasks.exe /Run /TN "' + $TaskName + '"')
