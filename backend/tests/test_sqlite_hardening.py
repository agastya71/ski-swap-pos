"""SQLite hardening tests — the pragmas set by the app-engine connect hook.

Background (2026-09-12): the ZD421 concurrency review found the database in
rollback-journal mode with a 5 s busy timeout — long report/backup reads
blocked cashiers' checkouts with 'database is locked'. The engine now sets
WAL + foreign_keys=ON + a 15 s busy timeout on every connection.

Assertions run through ``engine.raw_connection()`` (the DBAPI cursor), which
exercises the connect hook and avoids sqlalchemy ``text()`` execution.
"""

import sqlite3

from app.database import engine


def _cursor():
    raw = engine.raw_connection()
    return raw, raw.cursor()


def test_app_engine_runs_wal_journal():
    """journal_mode must be WAL on the file-backed app database — readers
    never block the writer (and vice versa) under multi-station load."""
    raw, cur = _cursor()
    try:
        journal = cur.execute("PRAGMA journal_mode").fetchone()[0]
        assert str(journal).lower() == "wal"
    finally:
        raw.close()


def test_app_engine_enforces_foreign_keys():
    """foreign_keys=ON: orphaned rows become loud constraint errors instead
    of silent data loss (all app deletes cascade explicitly, so this only
    converts *future* forgotten-cascade bugs into errors)."""
    raw, cur = _cursor()
    try:
        fk = cur.execute("PRAGMA foreign_keys").fetchone()[0]
        assert fk == 1
    finally:
        raw.close()


def test_app_engine_busy_timeout():
    """15 s busy timeout — transient lock contention resolves by waiting
    instead of erroring at the 5 s default."""
    raw, cur = _cursor()
    try:
        busy = cur.execute("PRAGMA busy_timeout").fetchone()[0]
        assert busy == 15000
    finally:
        raw.close()


def test_fk_enforcement_blocks_orphaned_sale_item():
    """Behavioral check: an orphaned sale_item insert must fail with an
    integrity error now that foreign_keys=ON (set by the connect hook on
    this very connection)."""
    import pytest

    raw, cur = _cursor()
    try:
        with pytest.raises(sqlite3.IntegrityError):
            cur.execute(
                "INSERT INTO sale_item (sale_id, item_id, line_number, "
                "quantity, sell_price, extended_price) "
                "VALUES (999999, 999999, 1, 1, 1.0, 1.0)"
            )
        raw.rollback()
    finally:
        raw.close()