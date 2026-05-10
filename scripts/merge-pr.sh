#!/usr/bin/env bash
# Usage: ./scripts/merge-pr.sh <PR-number>
# Commits pending wolf files, squash-merges the PR, and pulls main.
set -euo pipefail

PR=${1:?Usage: merge-pr.sh <PR-number>}

# Commit any pending changes to already-tracked wolf files (e.g. buglog.json).
# Uses -u to avoid accidentally staging untracked files in .wolf/.
if ! git diff --quiet .wolf/ 2>/dev/null; then
  git add -u .wolf/
  git commit -m "chore: update wolf files before merge"
fi

gh pr merge "$PR" --squash --delete-branch
git pull
