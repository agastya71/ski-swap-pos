#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Ski Swap POS ==="

# Install backend deps
echo "[1/3] Installing backend dependencies..."
cd backend
pip install -r requirements.txt --quiet
echo "      Done."

# Run migrations
echo "[2/3] Running database migrations..."
alembic upgrade head
echo "      Done."

# Launch server
echo "[3/3] Starting server on http://0.0.0.0:8000"
echo "      Open http://localhost:8000 in your browser."
echo "      Share this machine's LAN IP with other POS stations."
echo ""
uvicorn app.main:app --host 0.0.0.0 --port 8000
