#!/usr/bin/env python3
"""One-time migration: single-DB mode -> registry + per-event databases (Phase G).

Reads the legacy single database (``backend/swap.db``), then:

  1. creates the REGISTRY (``backend/registry.db``) with the event catalogue
     (one row per event, each pointing at its own database file) and ALL user
     accounts (shared across events; usernames globally unique),
  2. copies each event's data into its own database file under
     ``backend/events/<slug>.db`` (SQLite backup API — WAL-safe).

The ORIGINAL source file is left untouched as a fallback backup. The daemon
must be STOPPED while this runs (it holds the old file open):

    sudo systemctl stop ski-swap-pos
    .venv/bin/python scripts/migrate_to_registry.py --yes
    sudo systemctl start ski-swap-pos

Safety:
  * refuses to run without ``--yes``,
  * refuses if the registry already exists (this is a ONE-TIME migration),
  * probes 127.0.0.1:8001 and refuses while the app daemon is serving.

Usage (from backend/, with the venv python):

    .venv/bin/python scripts/migrate_to_registry.py --yes
"""

from __future__ import annotations

import argparse
import socket
import sqlite3
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import create_engine, event as sa_event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.database import (  # noqa: E402
    RegistryBase,
    _set_sqlite_pragmas,
    _sqlite_connect_args,
)
from app.models.registry import RegistryEvent, RegistryUser  # noqa: E402

DEFAULT_DB = BACKEND_DIR / "swap.db"
DAEMON_PROBE_HOST, DAEMON_PROBE_PORT = "127.0.0.1", 8001


def _daemon_appears_running() -> bool:
    """Best-effort check whether the app daemon is serving on :8001."""
    try:
        with socket.create_connection((DAEMON_PROBE_HOST, DAEMON_PROBE_PORT), timeout=0.5):
            return True
    except OSError:
        return False


def _slugify(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in name.strip().lower())
    cleaned = "_".join(part for part in cleaned.split("_") if part)
    return cleaned or "event"


def _unique_filename(taken: set[str], name: str) -> str:
    base = _slugify(name)
    candidate = f"{base}.db"
    n = 1
    while candidate in taken:
        n += 1
        candidate = f"{base}{n}.db"
    taken.add(candidate)
    return candidate


def _copy_sqlite(src_path: Path, dst_path: Path) -> None:
    """Consistent copy via the SQLite backup API (WAL-safe)."""
    src = sqlite3.connect(str(src_path))
    try:
        dst = sqlite3.connect(str(dst_path))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate the single DB to registry + per-event DBs.")
    parser.add_argument("--yes", action="store_true", help="Required: confirm the migration.")
    parser.add_argument(
        "--db-path",
        type=Path,
        default=DEFAULT_DB,
        help="Legacy single database to migrate (default: backend/swap.db).",
    )
    args = parser.parse_args()

    if not args.yes:
        print("Refusing to run without --yes (this creates the registry and copies databases).")
        return 2
    if _daemon_appears_running():
        print("The app daemon appears to be serving on :8001 — stop it first:")
        print("    sudo systemctl stop ski-swap-pos")
        return 2
    if not args.db_path.exists():
        print(f"Source database not found: {args.db_path}")
        return 2

    registry_path = BACKEND_DIR / "registry.db"
    if registry_path.exists():
        print(f"Refusing: registry already exists at {registry_path} (one-time migration).")
        return 2

    events_dir = BACKEND_DIR / "events"
    events_dir.mkdir(parents=True, exist_ok=True)

    # ── read the legacy database ────────────────────────────────────────
    con = sqlite3.connect(str(args.db_path))
    try:
        con.row_factory = sqlite3.Row
        events = con.execute(
            "SELECT id, name, year, commission_rate, vendor_commission_rate, "
            "is_active, created_at FROM event ORDER BY id"
        ).fetchall()
        users = con.execute(
            "SELECT username, password_hash, role, is_active FROM user ORDER BY id"
        ).fetchall()
    finally:
        con.close()

    # Username uniqueness is global in the registry (accounts are shared).
    seen_usernames: set[str] = set()
    unique_users = []
    for u in users:
        if u["username"] in seen_usernames:
            print(
                f"  ! duplicate username {u['username']!r} across events — "
                "keeping the first occurrence"
            )
            continue
        seen_usernames.add(u["username"])
        unique_users.append(u)

    # Exactly one active event (the first active wins; others deactivated).
    actives = [e for e in events if e["is_active"]]
    active_id = actives[0]["id"] if actives else None  # already an int from SQLite
    if len(actives) > 1:
        print(
            f"  ! {len(actives)} events flagged active — keeping event id "
            f"{active_id} active, deactivating the rest"
        )

    # ── build the registry ──────────────────────────────────────────────
    reg_engine = create_engine(
        f"sqlite:///{registry_path}", connect_args=_sqlite_connect_args()
    )
    sa_event.listens_for(reg_engine, "connect")(_set_sqlite_pragmas)
    RegistryBase.metadata.create_all(reg_engine)
    reg_db = sessionmaker(autocommit=False, autoflush=False, bind=reg_engine)()

    taken: set[str] = set()
    try:
        for e in events:
            is_active = active_id is not None and int(e["id"]) == active_id
            db_filename = _unique_filename(taken, str(e["name"]))
            reg_db.add(
                RegistryEvent(
                    id=int(e["id"]),
                    name=e["name"],
                    year=int(e["year"]),
                    commission_rate=float(e["commission_rate"]),
                    vendor_commission_rate=float(e["vendor_commission_rate"]),
                    is_active=is_active,
                    db_filename=db_filename,
                    created_at=e["created_at"],
                )
            )

            # Copy this event's data into its own database file.
            dst = events_dir / db_filename
            _copy_sqlite(args.db_path, dst)
            print(f"  event {e['id']} {e['name']!r} -> events/{db_filename} (active={is_active})")

        for u in unique_users:
            reg_db.add(
                RegistryUser(
                    username=u["username"],
                    password_hash=u["password_hash"],
                    role=u["role"],
                    is_active=bool(u["is_active"]),
                )
            )
        reg_db.commit()
    finally:
        reg_db.close()
        reg_engine.dispose()

    print()
    print(f"Registry created: {registry_path}")
    print(f"Accounts migrated: {len(unique_users)} (shared across events)")
    print("Next: sudo systemctl start ski-swap-pos  (start.sh binds the active event DB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())