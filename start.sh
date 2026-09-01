#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Ski Swap POS ==="

# ── 1. Backend dependencies ────────────────────────────────────────────────
# Uses the uv-managed venv at backend/.venv (see docs/setup-new-machine.md).
# uv-created venvs do NOT include pip, so deps are installed with `uv pip`.
echo "[1/4] Installing backend dependencies..."
cd backend
if [[ ! -d .venv ]]; then
  echo "      .venv not found — creating with uv (python 3.11) ..."
  uv venv --python 3.11
fi
# shellcheck disable=SC1091
source .venv/bin/activate
if command -v uv >/dev/null 2>&1; then
  uv pip install -r requirements.txt --quiet
elif python -m pip --version >/dev/null 2>&1; then
  python -m pip install -r requirements.txt --quiet
else
  echo "      Neither uv nor pip found — skipping deps (assuming already installed)."
fi
echo "      Done."

# ── 2. Database migrations ──────────────────────────────────────────────────
echo "[2/4] Running database migrations..."
alembic upgrade head
echo "      Done."

# ── 3. Data repair + seed ──────────────────────────────────────────────────
# 3a. Repair sale.date_of_sale values that were stored as the bare year (the
#     integer 2026) instead of a full datetime string. This happened because
#     seed_demo.py (and an earlier version of the checkout service) passed a
#     `date` to a `DateTime` column. Backfill from sale.created_at, which is
#     always a valid timestamp. Idempotent: only touches non-NULL non-text
#     values, so it's a no-op once the data is clean.
echo "[3/4] Repairing data + ensuring seed..."
python - <<'PY'
import sqlite3

db = sqlite3.connect("swap.db")
n = db.execute(
    "UPDATE sale SET date_of_sale = created_at "
    "WHERE date_of_sale IS NOT NULL AND typeof(date_of_sale) != 'text'"
).rowcount
db.commit()
db.close()
if n:
    print(f"      Repaired {n} sale.date_of_sale value(s) (backfilled from created_at).")
else:
    print("      No date_of_sale repairs needed.")

# 3a-bis. Re-sync item.remaining = quantity - non-voided sold units. The
#     quantity model (2026-08-30) keeps `quantity` as the ORIGINAL intake count
#     and `remaining` as on-hand sellable units; sales decrement remaining, voids
#     restore it. This repair is idempotent and self-heals any drift from items
#     sold while an older build was running (which decremented `quantity`).
#     Skips silently on pre-migration DBs where the column doesn't exist yet.
n_rem = -1
try:
    cur = db.cursor()
    cur.execute("PRAGMA table_info(item)")
    if any(col[1] == "remaining" for col in cur.fetchall()):
        cur.execute(
            "UPDATE item SET remaining = quantity - COALESCE(("
            "SELECT SUM(si.quantity) FROM sale_item si JOIN sale s ON si.sale_id = s.id "
            "WHERE si.item_id = item.id AND s.is_voided = 0), 0)"
        )
        n_rem = cur.rowcount
    db.commit()
except Exception:
    pass  # item table not present yet (fresh DB) — alembic will create it
db.close()
if n_rem >= 0:
    print(f"      Re-synced item.remaining for {n_rem} row(s) (quantity model repair).")
else:
    print("      item table not migrated yet — skipping remaining re-sync.")
PY

# 3b. Seed demo data if the database has no active event yet. seed_demo.py is
#     idempotent, so running it on a fresh DB is safe; we skip it when an
#     active event already exists to keep startup quiet.
HAVE_EVENT="$(python -c "import sqlite3;print(sqlite3.connect('swap.db').execute('select count(*) from event where is_active=1').fetchone()[0])")"
if [[ "$HAVE_EVENT" == "0" ]]; then
  echo "      No active event — seeding demo data..."
  python seed_demo.py
else
  echo "      Active event present — skipping seed."
fi
echo "      Done."

# ── 4. Launch server ────────────────────────────────────────────────────────
# Default bind is 127.0.0.1:8001 because Caddy fronts the app on :443 and
# :8000 (HTTPS) and reverse-proxies to 127.0.0.1:8001 — Caddy OWNS :8000, so
# the app must NOT bind there. Override with APP_HOST / APP_PORT for other
# setups (e.g. LAN-direct dev without Caddy: APP_HOST=0.0.0.0 APP_PORT=8000).
APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-8001}"

# JWT_SECRET: persist to backend/.jwt_secret so tokens survive restarts. If the
# env var is already set, it takes precedence and is NOT overwritten.
JWT_SECRET_FILE="$(pwd)/.jwt_secret"
if [[ -z "${JWT_SECRET:-}" ]]; then
  if [[ -f "$JWT_SECRET_FILE" ]]; then
    export JWT_SECRET="$(cat "$JWT_SECRET_FILE")"
  else
    export JWT_SECRET="$(openssl rand -hex 32)"
    printf '%s' "$JWT_SECRET" > "$JWT_SECRET_FILE"
    chmod 600 "$JWT_SECRET_FILE"
    echo "      Generated new JWT_SECRET -> $JWT_SECRET_FILE"
  fi
fi

echo "[4/4] Starting server on http://${APP_HOST}:${APP_PORT}"
if [[ "$APP_HOST" == "127.0.0.1" && "$APP_PORT" == "8001" ]]; then
  echo "      Caddy fronts this on https://mysl-pos.duckdns.org/ and :8000"
fi
echo "      Local docs: http://localhost:${APP_PORT}/docs"
echo ""
uvicorn app.main:app --host "${APP_HOST}" --port "${APP_PORT}"