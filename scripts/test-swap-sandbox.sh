#!/usr/bin/env bash
# Build (or rebuild) the throwaway TEST SWAP sandbox used by
# scripts/test-swap-checklist.mjs.
#
# Why a script: the checklist WRITES rows (qty edits, added lines, payment
# changes). It must never touch production, and it must not touch the real
# test-event DB either — that one is the source of truth for TEST SWAP.
#
# The `-wal`/`-shm` deletion matters: copying only the .db while stale WAL
# files sit beside it replays the previous run's edits on next open, which
# looks exactly like "the reset didn't work".
#
#   bash scripts/test-swap-sandbox.sh          # build /tmp/uicheck
#   bash scripts/test-swap-sandbox.sh --start  # build + launch on :8011
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="${SANDBOX:-/tmp/uicheck}"
PORT="${PORT:-8011}"

echo "# rebuilding sandbox at $SANDBOX"
rm -rf "$SANDBOX"
mkdir -p "$SANDBOX/events"

cp "$REPO_ROOT/backend/registry.db" "$SANDBOX/registry.db"
cp "$REPO_ROOT/backend/events/test_swap_pos_2026.db" "$SANDBOX/events/"

# Activate the TEST event in the COPY only.
"$REPO_ROOT/backend/.venv/bin/python" - "$SANDBOX" <<'PY'
import sqlite3, sys
sandbox = sys.argv[1]
c = sqlite3.connect(f"{sandbox}/registry.db")
c.execute("update event set is_active = 0")
c.execute("update event set is_active = 1 where id = 1")
c.commit()
rows = list(c.execute("select id, name, is_active from event order by id"))
print(f"# sandbox events: {rows}")
d = sqlite3.connect(f"{sandbox}/events/test_swap_pos_2026.db")
edits = d.execute("select count(*) from sale_edit").fetchone()[0]
sales = d.execute("select count(*) from sale").fetchone()[0]
print(f"# sandbox data: {sales} sales, {edits} edit-history rows (want 0)")
PY

if [[ "${1:-}" == "--start" ]]; then
  echo "# starting sandbox server on 127.0.0.1:$PORT"
  cd "$REPO_ROOT/backend"
  REGISTRY_URL="sqlite:///$SANDBOX/registry.db" \
  EVENTS_DIR="$SANDBOX/events" \
  DATABASE_URL="sqlite:///$SANDBOX/swap.db" \
  JWT_SECRET=uicheck-sandbox-only \
    .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
fi
