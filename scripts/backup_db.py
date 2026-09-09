#!/usr/bin/env python3
"""Scheduled online backup of the Ski Swap POS SQLite database.

Uses the SQLite backup API (python stdlib ``sqlite3.Connection.backup``), which
produces a consistent snapshot even while the uvicorn server is writing — never
copy the live ``swap.db`` file with ``cp``; that can tear pages mid-write.

Each run:
  1. Opens the source database read-only (busy_timeout guards against locks).
  2. Backs it up to ``<dest>/swap-YYYYmmdd-HHMMSS.db``.
  3. Verifies the copy with ``PRAGMA integrity_check`` and a table count.
  4. Prunes backups older than the retention window (default 30 days).

The default destination is ``~/skiswap-backups/`` — deliberately outside the
repository, so wiping/re-cloning the repo cannot destroy the backups.

Usage:
    python3 scripts/backup_db.py [--dest DIR] [--keep-days N] [--quiet]

Cron (installed for user ramdev-wudali, every 6 hours):
    0 */6 * * *  flock -n /tmp/skiswap-backup.lock /usr/bin/python3 \
        /home/ramdev-wudali/code/ski-swap-pos/scripts/backup_db.py --quiet \
        >> /home/ramdev-wudali/skiswap-backups/backup.log 2>&1

Exit codes: 0 success, 1 backup or verification failure, 2 usage error.
Recovery procedure: docs/backup-recovery.md
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = REPO_ROOT / "backend" / "swap.db"
DEFAULT_DEST = Path.home() / "skiswap-backups"
DEFAULT_KEEP_DAYS = 30
BUSY_TIMEOUT_MS = 10_000


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Online backup of backend/swap.db")
    p.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB,
        help=f"source database (default: {DEFAULT_DB})",
    )
    p.add_argument(
        "--dest",
        type=Path,
        default=Path(os.environ.get("BACKUP_DIR", DEFAULT_DEST)),
        help=f"backup directory (default: {DEFAULT_DEST}, env BACKUP_DIR)",
    )
    p.add_argument(
        "--keep-days",
        type=int,
        default=DEFAULT_KEEP_DAYS,
        help=f"prune backups older than this many days (default: {DEFAULT_KEEP_DAYS})",
    )
    p.add_argument("--quiet", action="store_true", help="print nothing on success")
    return p.parse_args()


def table_count(db_path: Path) -> int:
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=BUSY_TIMEOUT_MS / 1000) as con:
            (n,) = con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()
            return int(n)
    except sqlite3.Error as exc:
        print(f"ERROR: cannot inspect {db_path}: {exc}", file=sys.stderr)
        sys.exit(1)


def backup(args: argparse.Namespace) -> Path:
    if not args.db.is_file():
        print(f"ERROR: source database not found: {args.db}", file=sys.stderr)
        sys.exit(1)

    args.dest.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    target = args.dest / f"swap-{stamp}.db"
    partial = target.with_suffix(".db.partial")

    # Read-only source connection: guarantees the backup never mutates swap.db.
    src = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True, timeout=BUSY_TIMEOUT_MS / 1000)
    src.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
    try:
        dst = sqlite3.connect(partial)
        try:
            src.backup(dst)  # online backup API: consistent under concurrent writes
        finally:
            dst.close()
    except sqlite3.Error as exc:
        partial.unlink(missing_ok=True)
        print(f"ERROR: backup failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        src.close()

    # Verify before promoting the .partial to its final name.
    try:
        with sqlite3.connect(partial) as con:
            (status,) = con.execute("PRAGMA integrity_check").fetchone()
        if status != "ok":
            raise sqlite3.DatabaseError(f"integrity_check returned: {status}")
    except sqlite3.Error as exc:
        partial.unlink(missing_ok=True)
        print(f"ERROR: backup verification failed: {exc}", file=sys.stderr)
        sys.exit(1)
    partial.rename(target)

    pruned = prune(args.dest, args.keep_days)
    if not args.quiet:
        src_kb = args.db.stat().st_size / 1024
        dst_kb = target.stat().st_size / 1024
        print(
            f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} "
            f"OK swap.db ({src_kb:.0f}K) -> {target} ({dst_kb:.0f}K, "
            f"{table_count(target)} tables, integrity ok); pruned {pruned} old backup(s)"
        )
    return target


def prune(dest: Path, keep_days: int) -> int:
    """Delete backup files older than the retention window (never the newest)."""
    cutoff = time.time() - keep_days * 24 * 3600
    backups = sorted(dest.glob("swap-*.db"), key=lambda p: p.stat().st_mtime)
    removed = 0
    for path in backups[:-1] if len(backups) > 1 else []:
        if path.stat().st_mtime < cutoff:
            path.unlink()
            removed += 1
    for stale in dest.glob("swap-*.db.partial"):  # clean crashed-run leftovers
        # age check protects a concurrent manual run that is mid-backup
        if stale.stat().st_mtime < time.time() - 3600:
            stale.unlink()
            removed += 1
    return removed


if __name__ == "__main__":
    backup(parse_args())