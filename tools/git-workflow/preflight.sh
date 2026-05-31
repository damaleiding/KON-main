#!/usr/bin/env sh
set -eu

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  echo "[FAIL] current directory is not inside a Git worktree."
  exit 1
fi

cd "$repo_root"

section() {
  printf "\n== %s ==\n" "$1"
}

section "Git"
git --version
printf "Root: %s\n" "$repo_root"
printf "Branch: %s\n" "$(git branch --show-current)"

section "Latest Commit"
git log --oneline -5 2>/dev/null || echo "No commits yet."

section "Doctor"
if [ -f "$repo_root/tools/project-harness/doctor.sh" ]; then
  "$repo_root/tools/project-harness/doctor.sh"
else
  echo "Doctor not found: tools/project-harness/doctor.sh"
fi

section "Status"
git status --short --branch

section "Cached Diff"
git diff --cached --stat

section "Helpful Commands"
echo "Stage core workflow files: ./tools/git-workflow/stage-core.sh"
echo "Review staged names:      git diff --cached --name-status"
echo "Commit:                   git commit -m \"type: summary\""
