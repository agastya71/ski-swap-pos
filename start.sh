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

# ── 2. Database bootstrap (registry + per-event migrations + repairs + seed)
# Phase G: scripts/bootstrap.py handles both layouts:
#   - no registry  -> legacy single-DB mode (alembic on DATABASE_URL + repairs
#     + seed-if-empty), and
#   - registry present -> per-event alembic heads + repairs on every event DB,
#     seeding only when the registry has no events.
echo "[2/4] Bootstrapping databases (registry + per-event)..."
python scripts/bootstrap.py
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