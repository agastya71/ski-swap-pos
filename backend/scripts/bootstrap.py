#!/usr/bin/env python3
"""Per-boot bootstrap: registry ensure + per-event migrations + repairs + seed.

Replaces start.sh's `alembic upgrade head` step for the Phase-G multi-database
layout:

  * no registry yet  -> LEGACY single-DB mode: alembic head on DATABASE_URL,
    repairs on that file, seed-if-empty (exactly the pre-Phase-G behavior);
  * registry present -> ensure the registry schema, run alembic head on EVERY
    registered event database, run the idempotent repairs on each event
    database, and seed demo data only when the registry has NO events.

Idempotent — safe to run on every boot (the systemd unit runs it via start.sh).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))


def _alembic_head(db_url: str) -> None:
    """Run alembic upgrade head against one database URL."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")


def _repairs(db_path: str) -> int:
    """Idempotent data repairs on one event database. Returns repaired count."""
    import sqlite3

    con = sqlite3.connect(db_path)
    try:
        cur = con.cursor()
        cur.execute("PRAGMA table_info(item)")
        has_remaining = any(col[1] == "remaining" for col in cur.fetchall())

        n = con.execute(
            "UPDATE sale SET date_of_sale = created_at "
            "WHERE date_of_sale IS NOT NULL AND typeof(date_of_sale) != 'text'"
        ).rowcount

        n_rem = 0
        if has_remaining:
            con.execute(
                "UPDATE item SET quantity = remaining + COALESCE(("
                "SELECT SUM(si.quantity) FROM sale_item si JOIN sale s ON si.sale_id = s.id "
                "WHERE si.item_id = item.id AND s.is_voided = 0), 0) "
                "WHERE quantity != remaining + COALESCE(("
                "SELECT SUM(si.quantity) FROM sale_item si JOIN sale s ON si.sale_id = s.id "
                "WHERE si.item_id = item.id AND s.is_voided = 0), 0)"
            )
            con.execute(
                "UPDATE item SET remaining = quantity - COALESCE(("
                "SELECT SUM(si.quantity) FROM sale_item si JOIN sale s ON si.sale_id = s.id "
                "WHERE si.item_id = item.id AND s.is_voided = 0), 0) "
                "WHERE remaining != quantity - COALESCE(("
                "SELECT SUM(si.quantity) FROM sale_item si JOIN sale s ON si.sale_id = s.id "
                "WHERE si.item_id = item.id AND s.is_voided = 0), 0)"
            )
            n_rem = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        con.commit()
        repaired = (n or 0) + (n_rem or 0)
        if repaired:
            print(f"      Repaired {repaired} row(s) in {os.path.basename(db_path)}")
        return repaired
    finally:
        con.close()


def main() -> int:
    import app.config as _cfg

    registry_path = Path(_cfg.REGISTRY_URL.replace("sqlite:///", "", 1))

    if not registry_path.exists():
        # ── LEGACY single-DB mode (pre-Phase-G layout) ──────────────────────
        db_url = os.getenv("DATABASE_URL", "sqlite:///./swap.db")
        print("[2/4] Running database migrations (legacy single-DB mode)...")
        _alembic_head(db_url)
        legacy_file = db_url.replace("sqlite:///", "", 1)
        if os.path.exists(legacy_file):
            print("[3/4] Repairing data + ensuring seed (legacy)...")
            _repairs(os.path.abspath(legacy_file))
            import sqlite3 as _sq

            n = _sq.connect(legacy_file).execute(
                "select count(*) from event where is_active=1"
            ).fetchone()[0]
            if not n:
                print("      No active event — seeding demo data...")
                subprocess.run([sys.executable, "seed_demo.py"], check=True, cwd=str(BACKEND_DIR))
            else:
                print("      Active event present — skipping seed.")
        return 0

    # ── Phase-G layout: registry exists ────────────────────────────────────
    from sqlalchemy import create_engine, event as sa_event

    from app.database import (
        RegistryBase,
        _set_sqlite_pragmas,
        _sqlite_connect_args,
        event_db_file,
        migrate_event_db,
    )
    from app.models.registry import RegistryEvent

    print("[2/4] Ensuring registry + per-event migrations...")
    reg_engine = create_engine(
        f"sqlite:///{registry_path}", connect_args=_sqlite_connect_args()
    )
    sa_event.listens_for(reg_engine, "connect")(_set_sqlite_pragmas)

    import app.models.registry  # noqa: F401  (register the tables)

    RegistryBase.metadata.create_all(reg_engine)

    # metadata.create_all only CREATES missing tables — for a registry created
    # before a column was added to RegistryEvent (e.g. exempt_seller_codes,
    # 2026-11-21) the existing table keeps its old shape. Add any missing
    # columns idempotently (no alembic for the registry: see models/registry.py).
    with reg_engine.connect() as con:
        existing = {
            row[1] for row in con.exec_driver_sql(
                "PRAGMA table_info(event)"
            ).fetchall()
        }
        if "exempt_seller_codes" not in existing:
            con.exec_driver_sql(
                "ALTER TABLE event ADD COLUMN exempt_seller_codes VARCHAR NULL"
            )
            con.commit()
            print("      + registry event.exempt_seller_codes column added")

    reg_con = reg_engine.connect()
    try:
        rows = reg_con.exec_driver_sql(
            "SELECT id, db_filename, is_active, exempt_seller_codes FROM event ORDER BY id"
        ).fetchall()
    finally:
        reg_con.close()

    for (db_filename, _is_active) in rows:
        path = event_db_file(str(db_filename))
        if not Path(path).exists():
            print(f"      ! event DB missing, skipping migration: {path}")
            continue
        _alembic_head(f"sqlite:///{path}")

    # The event-DB event row mirrors registry catalogue fields; reports read
    # THIS row (data routers resolve the active event in the event DB). The
    # registry is the source of truth for the exempt-seller list — sync it so
    # a registry-side edit (or a pre-sync row) can't leave a NULL behind.
    # create_event already writes both; this only heals drift.
    for (event_id, db_filename, _is_active, exempt_raw) in rows:
        path = event_db_file(str(db_filename))
        if not Path(path).exists():
            continue
        import sqlite3 as _evsq

        ev_con = _evsq.connect(path)
        try:
            cols = {r[1] for r in ev_con.execute("PRAGMA table_info(event)").fetchall()}
            if "exempt_seller_codes" not in cols:
                continue  # pre-migration DB; _alembic_head above fixed it
            current = ev_con.execute(
                "SELECT exempt_seller_codes FROM event WHERE id = ?", (event_id,)
            ).fetchone()
            if current is not None and (current[0] or None) != (exempt_raw or None):
                ev_con.execute(
                    "UPDATE event SET exempt_seller_codes = ? WHERE id = ?",
                    (exempt_raw, event_id),
                )
                ev_con.commit()
                print(
                    f"      ~ event '{db_filename}': exempt_seller_codes "
                    f"synced from registry → {exempt_raw!r}"
                )
        finally:
            ev_con.close()

    print("[3/4] Repairing data + ensuring seed...")
    for (db_filename, _is_active) in rows:
        path = event_db_file(str(db_filename))
        if not Path(path).exists():
            continue
        _repairs(os.path.abspath(path))

    has_events = len(rows) > 0
    if not has_events:
        print("      No events in the registry — seeding demo data...")
        subprocess.run([sys.executable, "seed_demo.py"], check=True, cwd=str(BACKEND_DIR))
    else:
        print(f"      {len(rows)} event(s) registered — skipping seed.")

    reg_engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())