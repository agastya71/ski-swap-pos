#!/usr/bin/env python3
"""Scheduled online backup of ALL Ski Swap POS SQLite databases.

Uses the SQLite backup API (python stdlib ``sqlite3.Connection.backup``), which
produces a consistent snapshot even while the uvicorn server is writing — never
copy the live ``.db`` files with ``cp``; that can tear pages mid-write.

By default backs up EVERY database in the backend layout:
  - ``backend/*.db``            (registry.db, legacy swap.db)
  - ``backend/events/*.db``     (per-event databases)
Each is written to ``<dest>/<stem>-YYYYmmdd-HHMMSS.db`` (e.g. ``swap-20261016-
170001.db``, ``registry-20261016-170001.db``, or ``test_swap_pos_2026-...``),
so the snapshot set always matches the registry's event catalogue. ``--db``
limits the run to a single source file (named by its own stem). Backups of
WAL-mode sources are converted back to delete-journal mode after the copy so
no ``-shm``/``-wal`` sidecars linger.

Each run:
  1. Opens each source database read-only (busy_timeout guards against locks).
  2. Backs it up to ``<dest>/<stem>-<stamp>.db`` via the online backup API.
  3. Converts the copy out of WAL mode and verifies with
     ``PRAGMA integrity_check`` before promoting ``.partial`` to its final
     name; failed/partial files are deleted, not kept.
  4. Prunes backups (per database stem) older than the retention window.

Usage:
    python3 scripts/backup_db.py [--db PATH] [--dest DIR] [--keep-days N] [--quiet]

Cron (installed for user ramdev-wudali, every 6 hours — invocation unchanged
since the single-DB era; it now covers every database):
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
BACKEND_DIR = DEFAULT_DB.parent
EVENTS_SUBDIR = "events"
DEFAULT_DEST = Path.home() / "skiswap-backups"
DEFAULT_KEEP_DAYS = 30
BUSY_TIMEOUT_MS = 10_000


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Online backup of all backend SQLite databases")
    p.add_argument(
        "--db",
        type=Path,
        default=None,
        help="back up a single source database instead of the whole backend set "
             f"(default: scan {BACKEND_DIR} and {BACKEND_DIR / EVENTS_SUBDIR})",
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


def discover_backends(backend_dir: Path) -> list[Path]:
    """Every database in the backend layout, or an empty list if none exist."""
    sidecars = ("-wal", "-shm")
    dbs = [
        p for p in sorted(backend_dir.glob("*.db"))
        if not p.name.endswith(sidecars)
    ]
    events = backend_dir / EVENTS_SUBDIR
    if events.is_dir():
        dbs += [
            p for p in sorted(events.glob("*.db"))
            if not p.name.endswith(sidecars)
        ]
    return dbs


def table_count(db_path: Path) -> int:
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=BUSY_TIMEOUT_MS / 1000) as con:
            (n,) = con.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").fetchone()
            return int(n)
    except sqlite3.Error as exc:
        print(f"ERROR: cannot inspect {db_path}: {exc}", file=sys.stderr)
        sys.exit(1)


def backup_one(src: Path, stem: str, dest: Path, stamp: str, quiet: bool) -> bool:
    """Back up one source DB. Returns True on success; False otherwise."""
    if not src.is_file():
        print(f"ERROR: source database not found: {src}", file=sys.stderr)
        return False

    target = dest / f"{stem}-{stamp}.db"
    partial = dest / f"{stem}-{stamp}.db.partial"

    # Read-only source connection: never mutates the live database.
    src_con = sqlite3.connect(f"file:{src}?mode=ro", uri=True, timeout=BUSY_TIMEOUT_MS / 1000)
    try:
        dst = sqlite3.connect(partial)
        try:
            src_con.backup(dst)  # online backup API: consistent under concurrent writes
            # WAL-mode sources leave the copy WAL-flagged; convert it so the
            # backup needs no -shm/-wal sidecars on later reads/inspection.
            journal = dst.execute("PRAGMA journal_mode").fetchone()[0]
            if str(journal).lower() == "wal":
                dst.execute("PRAGMA journal_mode = DELETE")
        finally:
            dst.close()
    except sqlite3.Error as exc:
        for p in (partial, dest / f"{partial.name}-wal", dest / f"{partial.name}-shm"):
            p.unlink(missing_ok=True)
        print(f"ERROR: backup of {src.name} failed: {exc}", file=sys.stderr)
        return False
    finally:
        src_con.close()

    # Verify before promoting the .partial to its final name.
    try:
        with sqlite3.connect(partial) as con:
            (status,) = con.execute("PRAGMA integrity_check").fetchone()
        if status != "ok":
            raise sqlite3.DatabaseError(f"integrity_check returned: {status}")
    except sqlite3.Error as exc:
        for p in (partial, dest / f"{partial.name}-wal", dest / f"{partial.name}-shm"):
            p.unlink(missing_ok=True)
        print(f"ERROR: backup verification failed for {src.name}: {exc}", file=sys.stderr)
        return False
    partial.rename(target)

    if not quiet:
        src_kb = src.stat().st_size / 1024
        dst_kb = target.stat().st_size / 1024
        print(
            f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} "
            f"OK {src.name} ({src_kb:.0f}K) -> {target.name} ({dst_kb:.0f}K, "
            f"{table_count(target)} tables, integrity ok)"
        )
    return True


def prune(dest: Path, stems: set[str], keep_days: int) -> int:
    """Delete backup files older than the retention window (per stem, never the newest)."""
    cutoff = time.time() - keep_days * 24 * 3600
    removed = 0
    for stem in stems:
        backups = sorted(dest.glob(f"{stem}-*.db"), key=lambda p: p.stat().st_mtime)
        # keep the newest of each stem even if past the window
        for path in backups[:-1] if len(backups) > 1 else []:
            if path.stat().st_mtime < cutoff:
                path.unlink()
                removed += 1
    never = time.time()
    for path in dest.iterdir():  # clean crashed-run leftovers, any stem
        name = path.name
        if (name.endswith(".db.partial") or name.endswith(".db.partial-wal")
                or name.endswith(".db.partial-shm")):
            # age check protects a concurrent manual run that is mid-backup
            if path.stat().st_mtime < never - 3600:
                path.unlink()
                removed += 1
    return removed


def main() -> None:
    args = parse_args()
    args.dest.mkdir(parents=True, exist_ok=True)
    failures = 0

    if args.db is not None:
        targets = [(args.db, args.db.stem)]
    else:
        targets = [(p, p.stem) for p in discover_backends(BACKEND_DIR)]
        if not targets:
            print(f"ERROR: no databases found under {BACKEND_DIR}", file=sys.stderr)
            sys.exit(1)
        # de-duplicate stems so two different files (e.g. backend/swap.db and
        # backend/events/swap.db) can never overwrite one another's backup
        seen: dict[str, Path] = {}
        deduped = []
        for src, stem in targets:
            if stem in seen:
                new_stem = f"{src.parent.name}-{stem}"
                print(f"INFO: duplicate stem '{stem}' ({seen[stem]} and {src}) "
                      f"— second file recorded as '{new_stem}'")
                stem = new_stem
            if stem in seen:
                print(f"ERROR: cannot disambiguate backup names for {src}", file=sys.stderr)
                sys.exit(1)
            seen[stem] = src
            deduped.append((src, stem))
        targets = deduped

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    for src, stem in targets:
        if not backup_one(src, stem, args.dest, stamp, args.quiet):
            failures += 1

    pruned = prune(args.dest, {stem for _, stem in targets}, args.keep_days)
    if not args.quiet:
        print(
            f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} "
            f"backup run: {len(targets) - failures}/{len(targets)} database(s) OK, "
            f"pruned {pruned} old file(s)"
        )
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()