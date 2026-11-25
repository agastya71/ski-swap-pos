#!/usr/bin/env bash
# Install the repo's git hooks.
#
# Hooks live in scripts/hooks/ (version-controlled) and are copied into
# .git/hooks/ — which git does not track, so they need reinstalling after a
# fresh clone. This script is idempotent: re-running it just refreshes them.
#
#   bash scripts/install-git-hooks.sh
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_SRC="$REPO_ROOT/scripts/hooks"
HOOKS_DST="$(git rev-parse --git-path hooks)"

if [[ ! -d "$HOOKS_SRC" ]]; then
  echo "no scripts/hooks directory — nothing to install" >&2
  exit 1
fi

mkdir -p "$HOOKS_DST"

installed=0
for hook in "$HOOKS_SRC"/*; do
  [[ -f "$hook" ]] || continue
  name="$(basename "$hook")"
  if [[ -e "$HOOKS_DST/$name" ]] && ! grep -q "managed by ski-swap-pos" "$HOOKS_DST/$name" 2>/dev/null; then
    echo "refusing to overwrite existing $HOOKS_DST/$name (not ours)" >&2
    echo "  move it aside and re-run if you want the repo version" >&2
    continue
  fi
  cp "$hook" "$HOOKS_DST/$name"
  chmod +x "$HOOKS_DST/$name"
  echo "installed $name"
  installed=$((installed + 1))
done

echo "$installed hook(s) installed into $HOOKS_DST"
echo "skip any hook for one command with:  git <cmd> --no-verify"
