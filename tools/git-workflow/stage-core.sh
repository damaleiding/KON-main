#!/usr/bin/env sh
set -eu

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  echo "[FAIL] current directory is not inside a Git worktree."
  exit 1
fi

cd "$repo_root"

for path in \
  .gitattributes \
  .gitignore \
  AGENTS.md \
  ai-cinematic-pipeline \
  docs/git-commit-workflow.md \
  tools/git-workflow \
  tools/project-harness \
  bluespace/AGENTS.md \
  bluespace/WORKFLOW.md \
  bluespace/_harness \
  bluespace/_pipeline \
  bluespace/docs \
  bluespace/refs/_index \
  bluespace/refs/_docs \
  bluespace/tools/production-ledger
do
  if [ -e "$path" ]; then
    git add -- "$path"
  elif git ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
    git add -- "$path"
  fi
done

echo "Staged core workflow files. Review before committing:"
git diff --cached --stat
