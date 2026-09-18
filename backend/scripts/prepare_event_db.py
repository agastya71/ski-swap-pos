#!/usr/bin/env python3
"""Create a fresh "Event day" database for the Ski Swap POS.

Run this after testing parties to replace the (demo/test-phase) database with
an EMPTY one that contains exactly:

  1. the migrated schema (alembic head, fresh alembic_version),
  2. the ACTIVE EVENT (required — the POS/intake flow needs it, and
     `start.sh` skips its demo-data seeding whenever an active event exists),
  3. ONE bootstrap admin account (users are event-scoped, so the event must
     exist before any user) — every other account is created fresh by that
     admin via the Admin page on event day.

Everything else (sellers, intakes, items, sales) starts empty: the database
sits waiting for the first real intake.

Safety:
  * refuses to run without ``--yes`` (this DELETES the existing database),
  * refuses while the app daemon is serving the default swap.db (probe on
    127.0.0.1:8001) — stop it first: ``sudo systemctl stop ski-swap-pos``,
  * backs up the existing database (and its -wal/-shm sidecars) to
    ``<name>.bak-pre-event-<timestamp>`` before removing anything.

The daemon must be STOPPED while this runs (it holds the SQLite file open).
Afterwards start it again; ``start.sh`` will find the schema already at head,
skip its repairs (no data), and SKIP the demo seeding (active event present).

Usage (from backend/, with the venv python):

    .venv/bin/python scripts/prepare_event_db.py \
        --event-name "MYSL Ski Swap 2026" --event-year 2026 \
        --commission-rate 0.30 --vendor-commission-rate 0.25 \
        --admin-username admin --yes

Without ``--admin-password`` a strong random password is generated and
printed ONCE — save it immediately. ``--db-path`` overrides the target
database (used by the test suite; defaults to ``backend/swap.db``).
"""

from __future__ import annotations

import argparse
import secrets
import shutil
import socket
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB = BACKEND_DIR / "swap.db"
DAEMON_PROBE_HOST, DAEMON_PROBE_PORT = "127.0.0.1", 8001


def _daemon_appears_running() -> bool:
    """Best-effort check whether the app daemon is serving on :8001."""
    try:
        with socket.create_connection(
            (DAEMON_PROBE_HOST, DAEMON_PROBE_PORT), timeout=0.5
        ):
            return True
    except OSError:
        return False


def _backup_existing(db_path: Path, stamp: str) -> list[Path]:
    """Copy the database and its WAL/SHM sidecars to timestamped backups."""
    backed_up: list[Path] = []
    for suffix in ("", "-wal", "-shm"):
        src = Path(str(db_path) + suffix)
        if src.exists():
            dst = src.with_name(f"{src.name}.bak-pre-event-{stamp}")
            shutil.copy2(src, dst)
            backed_up.append(dst)
    return backed_up


def _migrate(db_path: Path) -> None:
    """Bring the (fresh) database to the latest schema via alembic."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(cfg, "head")


def _create_event_and_admin(
    db_path: Path,
    event_name: str,
    event_year: int,
    commission_rate: float,
    vendor_commission_rate: float,
    admin_username: str,
    admin_password: str,
) -> tuple[int, str]:
    """Create the active event + the bootstrap admin.

    Returns (event_id, admin_username).
    """
    from sqlalchemy import create_engine, event as sa_event
    from sqlalchemy.orm import sessionmaker

    from app.models import Event, User
    from app.services.auth import hash_password
    engine = create_engine(f"sqlite:///{db_path}")

    @sa_event.listens_for(engine, "connect")
    def _pragmas(dbapi_connection, _record):  # match the app's connection hook
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    db = sessionmaker(bind=engine)()
    try:
        # A fresh database has no other events — this one becomes (and stays)
        # the single active event, mirroring create_event() semantics.
        event = Event(
            name=event_name,
            year=event_year,
            commission_rate=commission_rate,
            vendor_commission_rate=vendor_commission_rate,
            is_active=True,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        user = User(
            event_id=event.id,  # pyright: ignore[reportArgumentType]
            username=admin_username,
            password_hash=hash_password(admin_password),
            role="admin",
            is_active=True,
        )
        db.add(user)
        db.commit()
        event_id = int(event.id)  # pyright: ignore[reportCallIssue,reportArgumentType]
        return event_id, admin_username
    finally:
        db.close()
        engine.dispose()


def _row_counts(db_path: Path) -> dict[str, int]:
    """Literal-query row counts for the self-check (allowlisted tables only)."""
    conn = sqlite3.connect(str(db_path))
    try:
        return {
            "event": conn.execute("SELECT COUNT(*) FROM event").fetchone()[0],
            "user": conn.execute("SELECT COUNT(*) FROM user").fetchone()[0],
            "seller": conn.execute("SELECT COUNT(*) FROM seller").fetchone()[0],
            "intake": conn.execute("SELECT COUNT(*) FROM intake").fetchone()[0],
            "item": conn.execute("SELECT COUNT(*) FROM item").fetchone()[0],
            "sale": conn.execute("SELECT COUNT(*) FROM sale").fetchone()[0],
            "sale_item": conn.execute("SELECT COUNT(*) FROM sale_item").fetchone()[0],
        }
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Create a fresh Event-day database (no demo data).",
    )
    parser.add_argument(
        "--event-name", required=True,
        help="Event name (e.g. 'MYSL Ski Swap 2026').",
    )
    parser.add_argument(
        "--event-year", required=True, type=int,
        help="Event year (e.g. 2026).",
    )
    parser.add_argument(
        "--commission-rate", type=float, default=0.30,
        help="MYSL share for individual sellers, 0..1 (default 0.30).",
    )
    parser.add_argument(
        "--vendor-commission-rate", type=float, default=None,
        help="MYSL share for vendor sellers, 0..1 (default: same as --commission-rate).",
    )
    parser.add_argument(
        "--admin-username", default="admin",
        help="Bootstrap admin username (default: admin).",
    )
    parser.add_argument(
        "--admin-password", default=None,
        help="Bootstrap admin password (omit to have a strong random one generated and printed).",
    )
    parser.add_argument(
        "--db-path", default=str(DEFAULT_DB),
        help="Target SQLite database path (default: backend/swap.db — THE live database).",
    )
    parser.add_argument(
        "--yes", action="store_true",
        help="Confirm: delete the existing database at --db-path and start over.",
    )
    args = parser.parse_args(argv)

    db_path = Path(args.db_path).resolve()
    vendor_rate = (
        args.vendor_commission_rate
        if args.vendor_commission_rate is not None
        else args.commission_rate
    )

    # ── Guardrails ────────────────────────────────────────────────────────
    if not args.yes:
        print("Refusing to run without --yes (this DELETES the target database).")
        return 2
    for rate, label in (
        (args.commission_rate, "commission"),
        (vendor_rate, "vendor commission"),
    ):
        if not 0.0 <= rate <= 1.0:
            print(f"Refusing: {label} rate must be between 0 and 1.")
            return 2
    if not str(args.event_name).strip():
        print("Refusing: --event-name must not be blank.")
        return 2
    if args.db_path == str(DEFAULT_DB) and _daemon_appears_running():
        print(
            "Refusing: the app daemon appears to be serving on 127.0.0.1:8001.\n"
            "Stop it first:  sudo systemctl stop ski-swap-pos\n"
            "Then re-run this script, and start it again afterwards:\n"
            "  sudo systemctl start ski-swap-pos"
        )
        return 2
    admin_password = args.admin_password or secrets.token_urlsafe(12)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    sidecars = [Path(str(db_path) + suffix) for suffix in ("", "-wal", "-shm")]
    present = [p for p in sidecars if p.exists()]

    print("Event-day database reset")
    print(f"  target     : {db_path}")
    print(f"  event      : {args.event_name} ({args.event_year})")
    print(f"  commission : {args.commission_rate:.0%} (vendor {vendor_rate:.0%})")
    print(f"  admin      : {args.admin_username}")
    print(
        f"  backing up : {[p.name for p in present]}"
        if present
        else "  existing   : none (fresh file)"
    )

    backed_up = _backup_existing(db_path, stamp)
    for path in backed_up:
        print(f"  backup     : {path.name}")
    for path in sidecars:
        if path.exists():
            path.unlink()

    print("[1/3] Migrating schema to alembic head...")
    _migrate(db_path)

    print("[2/3] Creating the active event...")
    print("[3/3] Creating the bootstrap admin...")
    _create_event_and_admin(
        db_path,
        args.event_name,
        args.event_year,
        args.commission_rate,
        vendor_rate,
        args.admin_username,
        admin_password,
    )

    print()
    print("Done. The database now contains ONLY the event and the bootstrap admin.")
    print(f"  login: {args.admin_username} / {admin_password}")
    if not args.admin_password:
        print("  ^ generated password — SAVE IT NOW (shown once).")
    print()
    print("Next steps:")
    print("  1. sudo systemctl start ski-swap-pos      (stop first if you used stop)")
    print("     start.sh will log 'Active event present — skipping seed.'")
    print(f"  2. Sign in as {args.admin_username}, open Admin, and create the")
    print("     event-day intake/cashier accounts (users are event-scoped, so")
    print("     they bind to the new event automatically).")
    print("  3. Spot-check: login works, GET /events/active returns the new")
    print("     event, and the seller search is empty.")

    # ── Post-run self-check (fail loudly if anything is off) ──────────────
    conn = sqlite3.connect(str(db_path))
    try:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        required = {
            "event", "user", "seller", "intake", "item", "sale", "alembic_version",
        }
        missing = required - tables
        if missing:
            print(f"WARNING: expected tables missing after migration: {sorted(missing)}")
            return 1
        counts = _row_counts(db_path)
        if counts["event"] != 1 or counts["user"] != 1:
            print(f"WARNING: unexpected row counts: {counts}")
            return 1
        active = conn.execute(
            "SELECT name, year, is_active FROM event"
        ).fetchone()
        print(
            f"  verified: event '{active[0]}' ({active[1]}) active={active[2]};"
            " users=1 (admin); sellers/intakes/items/sales = 0"
        )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())