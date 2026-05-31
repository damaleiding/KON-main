$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Write-Section($Text) {
  Write-Host ""
  Write-Host "== $Text =="
}

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
  Write-Host "[FAIL] Current directory is not inside a Git worktree."
  exit 1
}

Set-Location $repoRoot

Write-Section "Git"
git --version
Write-Host "Root: $repoRoot"
Write-Host "Branch: $(git branch --show-current)"

Write-Section "Latest Commit"
$log = & cmd.exe /d /s /c "git log --oneline -5 2>NUL"
if ($LASTEXITCODE -ne 0 -or -not $log) {
  Write-Host "No commits yet."
} else {
  $log
}

Write-Section "Doctor"
$doctor = Join-Path $repoRoot "tools/project-harness/doctor.ps1"
if (Test-Path -LiteralPath $doctor) {
  & $doctor
} else {
  Write-Host "Doctor not found: $doctor"
}

Write-Section "Status"
git status --short --branch

Write-Section "Cached Diff"
git diff --cached --stat

Write-Section "Helpful Commands"
Write-Host "Stage core workflow files: .\tools\git-workflow\stage-core.ps1"
Write-Host "Review staged names:      git diff --cached --name-status"
Write-Host "Commit:                   git commit -m `"type: summary`""
