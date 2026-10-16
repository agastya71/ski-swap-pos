#!/usr/bin/env bash
# sync_from_primary.sh — pull a consistent DB snapshot from the primary Ski
# Swap POS server (192.168.4.136) onto this standby machine, and install it
# into the local backend/ so failover only requires starting the app.
#
# How it works
#   1. REMOTE snapshot: connects over SSH and uses the SQLite online backup
#      API (sqlite3.Connection.backup) on EVERY backend/*.db on the primary —
#      registry.db, per-event databases, and legacy swap.db alike. Consistent
#      even while uvicorn is writing (never rsync/cp live SQLite files).
#   2. Each snapshot is verified with PRAGMA integrity_check on the primary
#      and again locally after download.
#   3. Downloads the snapshot dir + backend/.jwt_secret via rsync.
#   4. Installs into the local backend/ — only when no app is listening on
#      :8001 locally (the standby app must be stopped while its DB is swapped;
#      re-running start.sh on failover applies any missing migrations).
#      The previous install is rotated to ~/skiswap-standby/prev-installs/.
#
# Usage:
#   scripts/sync_from_primary.sh [--quiet] [--dry-run] [--no-remote]
#                                [--dest DIR]
#     --quiet      log only the summary line and errors
#     --dry-run    snapshot + download, but skip the local install
#     --no-remote  skip SSH/rsync; re-install from an existing local snapshot
#                  (useful for testing / manual restore)
#     --dest DIR   install target (default: <repo>/backend)
#
# Exit codes: 0 ok, 1 sync/verify failure, 2 usage error.
#
# Schedule (systemd --user): ski-swap-standby-sync.timer, every 15 min.
# Runbook: docs/standby-failover.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PRIMARY_USER="${PRIMARY_USER:-ramdev-wudali}"
PRIMARY_HOST="${PRIMARY_HOST:-192.168.4.136}"
PRIMARY_DIR="${PRIMARY_DIR:-~/code/ski-swap-pos/backend}"
SNAPSHOT_DIR="${SNAPSHOT_DIR:-$HOME/skiswap-standby/snapshot}"
PREV_DIR="${PREV_DIR:-$HOME/skiswap-standby/prev-installs}"
APP_PORT="${APP_PORT:-8001}"

QUIET=0; DRY_RUN=0; NO_REMOTE=0; DEST="${REPO_ROOT}/backend"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet) QUIET=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --no-remote) NO_REMOTE=1; shift ;;
    --dest) DEST="$2"; shift 2 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

log() { local ts; ts="$(date '+%Y-%m-%d %H:%M:%S')"; echo "[$ts] $*"; }
debug() { [[ $QUIET -eq 1 ]] || log "$@"; }

# ── 1. Remote consistent snapshot (SSH) ────────────────────────────────────
if [[ $NO_REMOTE -eq 0 ]]; then
  debug "snapshotting databases on ${PRIMARY_USER}@${PRIMARY_HOST}:${PRIMARY_DIR} ..."
  ssh -o ConnectTimeout=5 -o BatchMode=yes \
      "${PRIMARY_USER}@${PRIMARY_HOST}" python3 - "${PRIMARY_DIR}" <<'PY' || { log "ERROR: remote snapshot failed (is sshd enabled on the primary? see docs/standby-failover.md §2)"; exit 1; }
import glob, os, shutil, sqlite3, sys
src_dir = os.path.expanduser(sys.argv[1])
dest = os.path.expanduser("~/skiswap-standby-sync")
os.makedirs(dest, exist_ok=True)
dbs = sorted(f for f in glob.glob(os.path.join(src_dir, "*.db"))
             if not f.endswith(("-wal", "-shm")))
if not dbs:
    print(f"ERROR: no *.db found in {src_dir}", file=sys.stderr); sys.exit(1)
for f in dbs:
    name = os.path.basename(f); out = os.path.join(dest, name)
    src = sqlite3.connect(f"file:{f}?mode=ro", uri=True, timeout=10)
    dst = sqlite3.connect(out)
    src.backup(dst)
    ok = dst.execute("PRAGMA integrity_check").fetchone()[0]
    dst.close(); src.close()
    if ok != "ok":
        os.remove(out); print(f"BAD snapshot: {name}", file=sys.stderr); sys.exit(1)
    print(f"ok: {name}")
jwt = os.path.join(src_dir, ".jwt_secret")
if os.path.exists(jwt):
    shutil.copy2(jwt, os.path.join(dest, ".jwt_secret"))
    os.chmod(os.path.join(dest, ".jwt_secret"), 0o600)
    print("ok: .jwt_secret")
PY

  rsync -az --delete "${PRIMARY_USER}@${PRIMARY_HOST}:skiswap-standby-sync/" "${SNAPSHOT_DIR}/" \
    || { log "ERROR: rsync download failed"; exit 1; }
  # snapshot on the primary is disposable; clean up to avoid clutter
  ssh -o ConnectTimeout=5 -o BatchMode=yes "${PRIMARY_USER}@${PRIMARY_HOST}" \
    "rm -rf ~/skiswap-standby-sync" 2>/dev/null || true
fi

[[ -d $SNAPSHOT_DIR ]] || { log "ERROR: no local snapshot at $SNAPSHOT_DIR (run once with remote enabled)"; exit 1; }

# ── 2. Local re-verification ───────────────────────────────────────────────
debug "verifying downloaded snapshot ..."
python3 - "$SNAPSHOT_DIR" <<'PY' || { log "ERROR: local verification failed"; exit 1; }
import glob, os, sqlite3, sys
d = sys.argv[1]
dbs = glob.glob(os.path.join(d, "*.db"))
if not dbs:
    print(f"ERROR: no *.db in {d}", file=sys.stderr); sys.exit(1)
for f in dbs:
    con = sqlite3.connect(f"file:{f}?mode=ro", uri=True)
    ok = con.execute("PRAGMA integrity_check").fetchone()[0]
    n = con.execute("SELECT count(*) FROM sqlite_master").fetchone()[0]
    con.close()
    if ok != "ok":
        print(f"BAD: {f}", file=sys.stderr); sys.exit(1)
    print(f"ok: {os.path.basename(f)} (n_tables={n})")
PY

if [[ $DRY_RUN -eq 1 ]]; then log "dry-run: snapshot current in $SNAPSHOT_DIR; install skipped"; exit 0; fi

# ── 3. Install into local backend/ (only when the app is stopped) ─────────
if ss -tlnH "sport = :${APP_PORT}" 2>/dev/null | grep -q .; then
  log "SKIP install: an app is listening on :${APP_PORT} locally — stop it first (standby DBs are swapped only while the app is down)"
  exit 0
fi

mkdir -p "$DEST" "$PREV_DIR"
prev="$PREV_DIR/$(date '+%Y%m%d-%H%M%S')"; mkdir -p "$prev"
shopt -s nullglob
moved=0
for f in "${DEST}"/*.db; do mv "$f" "$prev/"; moved=$((moved+1)); done
shopt -u nullglob
cp -a "$SNAPSHOT_DIR"/*.db "$DEST"/
if [[ -f "$SNAPSHOT_DIR/.jwt_secret" ]]; then
  cp -a "$SNAPSHOT_DIR/.jwt_secret" "$DEST/.jwt_secret"; chmod 600 "$DEST/.jwt_secret"
else
  log "WARN: snapshot has no .jwt_secret — keeping the local one (tokens from the primary will not survive failover)"
fi
# keep only the 3 most recent previous installs
ls -1t "$PREV_DIR" | tail -n +4 | while read -r d; do rm -rf "$PREV_DIR/$d"; done

log "SYNC OK: installed $(ls -1 "$SNAPSHOT_DIR"/*.db | wc -l) DB file(s) from ${PRIMARY_HOST} -> ${DEST} (previous install rotated to $prev; snapshot: $(stat -c %y "$SNAPSHOT_DIR" | cut -d. -f1))"