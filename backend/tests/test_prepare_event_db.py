"""Tests for scripts/prepare_event_db.py — the Event-day database reset.

Everything runs against tmp_path databases; the live backend/swap.db is never
touched. The script is loaded from its file (backend/scripts/ is not a
package) and driven through main(argv).
"""

import importlib.util
import re
import sqlite3
from pathlib import Path

from app.services.auth import verify_password

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare_event_db.py"
_spec = importlib.util.spec_from_file_location("prepare_event_db", SCRIPT)
assert _spec and _spec.loader
prepare_event_db = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prepare_event_db)


def _run(db_path: Path, extra: list[str] | None = None) -> int:
    """Run the script against a temp database with a fixed admin password."""
    return prepare_event_db.main(
        [
            "--event-name", "MYSL Ski Swap 2026",
            "--event-year", "2026",
            "--commission-rate", "0.30",
            "--vendor-commission-rate", "0.25",
            "--admin-username", "admin",
            "--admin-password", "EventAdmin1!",
            "--db-path", str(db_path),
            "--yes",
            *(extra or []),
        ]
    )


def _rows(db_path: Path, query: str):
    conn = sqlite3.connect(str(db_path))
    try:
        # pi-lens-ignore: python-sql-injection — every caller passes a literal.
        return conn.execute(query).fetchall()
    finally:
        conn.close()


def test_creates_fresh_event_day_db(tmp_path):
    """The reset produces: schema at head, ONE active event, ONE admin
    (verifiable password), and zero event data (no demo rows anywhere)."""
    db = tmp_path / "event-day.db"
    assert _run(db) == 0

    # Event: exactly one, active, with the requested name/year/rates.
    events = _rows(
        db,
        "SELECT name, year, commission_rate, vendor_commission_rate, is_active FROM event",
    )
    assert len(events) == 1
    name, year, commission, vendor, is_active = events[0]
    assert (name, year, is_active) == ("MYSL Ski Swap 2026", 2026, 1)
    assert (commission, vendor) == (0.30, 0.25)

    # Exactly one user — the bootstrap admin — with a verifiable password.
    users = _rows(db, "SELECT username, role, password_hash, is_active FROM user")
    assert len(users) == 1
    username, role, password_hash, user_active = users[0]
    assert (username, role, user_active) == ("admin", "admin", 1)
    assert verify_password("EventAdmin1!", password_hash)

    # Zero event data: the DB waits for the first real intake. The demo
    # users from seed_demo.py are nowhere to be found.
    for table in ("seller", "intake", "item", "sale", "sale_item"):
        assert _rows(db, f"SELECT COUNT(*) FROM {table}") == [(0,)]
    demo = _rows(
        db,
        "SELECT COUNT(*) FROM user WHERE username IN ('intake1', 'cashier1')",
    )
    assert demo == [(0,)]

    # Schema: migrated (alembic_version carries a revision).
    assert len(_rows(db, "SELECT version_num FROM alembic_version")) == 1


def test_refuses_without_yes(tmp_path):
    """Without --yes the script refuses and does not touch the filesystem."""
    db = tmp_path / "event-day.db"
    assert (
        prepare_event_db.main(
            [
                "--event-name", "X",
                "--event-year", "2026",
                "--db-path", str(db),
            ]
        )
        == 2
    )
    assert not db.exists()


def test_refuses_out_of_range_rate(tmp_path):
    """Commission rates outside 0..1 are rejected before anything happens."""
    db = tmp_path / "event-day.db"
    assert _run(db, extra=["--commission-rate", "1.5"]) == 2
    assert not db.exists()


def test_backup_created_and_rebuild(tmp_path):
    """A re-run backs up the previous database (never clobbering backups) and
    rebuilds from scratch: the old admin is gone, a new one is created."""
    db = tmp_path / "event-day.db"
    assert _run(db) == 0
    first_hash = _rows(db, "SELECT password_hash FROM user")[0][0]

    assert _run(db) == 0

    backups = list(tmp_path.glob("event-day.db.bak-pre-event-*"))
    assert len(backups) == 1
    # The backup holds the PREVIOUS database (its admin hash is preserved).
    assert _rows(backups[0], "SELECT password_hash FROM user")[0][0] == first_hash
    # The rebuilt database has exactly one fresh admin.
    current = _rows(db, "SELECT username, role FROM user")
    assert current == [("admin", "admin")]


def test_generated_password_when_omitted(tmp_path, capsys):
    """Without --admin-password a strong random password is generated,
    printed once, and verifies against the stored hash."""
    db = tmp_path / "event-day.db"
    assert (
        prepare_event_db.main(
            [
                "--event-name", "MYSL Ski Swap 2026",
                "--event-year", "2026",
                "--db-path", str(db),
                "--yes",
            ]
        )
        == 0
    )
    match = re.search(r"login: admin / (\S+)", capsys.readouterr().out)
    assert match
    generated = match.group(1)
    stored = _rows(db, "SELECT password_hash FROM user")[0][0]
    assert verify_password(generated, stored)