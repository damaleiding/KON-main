$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
  Write-Host "[FAIL] Current directory is not inside a Git worktree."
  exit 1
}

Set-Location $repoRoot

$paths = @(
  ".gitattributes",
  ".gitignore",
  "AGENTS.md",
  "ai-cinematic-pipeline",
  "docs/git-commit-workflow.md",
  "tools/git-workflow",
  "tools/project-harness",
  "bluespace/AGENTS.md",
  "bluespace/WORKFLOW.md",
  "bluespace/_harness",
  "bluespace/_pipeline",
  "bluespace/docs",
  "bluespace/refs/_index",
  "bluespace/refs/_docs",
  "bluespace/tools/production-ledger"
)

foreach ($path in $paths) {
  if (Test-Path -LiteralPath $path) {
    git add -- $path
    continue
  }

  git ls-files --error-unmatch -- $path *> $null
  if ($LASTEXITCODE -eq 0) {
    git add -- $path
  }
}

Write-Host "Staged core workflow files. Review before committing:"
git diff --cached --stat
