"""Service-disruption guard: bootstrap must survive a fresh boot.

PR #145 shipped a bootstrap.py that crashed at boot (tuple unpack against a
widened SELECT) — the daemon crash-looped and mysl-pos.duckdns.org went down
while every backend pytest stayed green, because nothing ever EXECUTED
bootstrap end-to-end. These tests do exactly that: run scripts/bootstrap.py
as a subprocess against a scratch registry + event DB (mirroring the daemon's
Phase-G layout) and fail on any nonzero exit / traceback.

Run from backend/:  .venv/bin/python -m pytest tests/test_bootstrap_service.py
"""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
BOOTSTRAP = BACKEND_DIR / "scripts" / "bootstrap.py"

# alembic writes ./alembic.ini-adjacent files? No — but it does chdir-sensitive
# relative resolution, so give the subprocess backend/ as cwd while pointing
# every data path at the scratch dir via env vars (exactly how start.sh could
# redirect on a standby machine).


def _event_db_filename(name: str) -> str:
    from app.database import slugify

    return f"{slugify(name)}.db"


def _make_registry(registry_path: Path, event_dbs: list[str]) -> None:
    con = sqlite3.connect(registry_path)
    con.execute(
        "CREATE TABLE event ("
        " id INTEGER PRIMARY KEY,"
        " name VARCHAR NOT NULL,"
        " year INTEGER,"
        " commission_rate FLOAT NOT NULL,"
        " vendor_commission_rate FLOAT,"
        " is_active INTEGER NOT NULL DEFAULT 1,"
        " db_filename VARCHAR,"
        " created_at TEXT,"
        " exempt_seller_codes VARCHAR NULL)"
    )
    for i, fn in enumerate(event_dbs, start=1):
        con.execute(
            "INSERT INTO event (name, year, commission_rate, vendor_commission_rate,"
            " is_active, db_filename, created_at, exempt_seller_codes)"
            " VALUES (?, 2026, 0.30, 0.30, 1, ?, datetime('now'), ?)",
            (f"Event {i}", fn, "MYSL2" if i == 1 else None),
        )
    con.commit()
    con.close()


def _make_event_db(events_dir: Path, filename: str, *, with_exempt: bool) -> Path:
    """Create an event DB at CURRENT schema via the real migration chain
    (same path start.sh uses), then stamp the event row."""
    path = events_dir / filename
    from app.database import migrate_event_db

    migrate_event_db(str(path))

    con = sqlite3.connect(path)
    cols = {r[1] for r in con.execute("PRAGMA table_info(event)").fetchall()}
    assert "exempt_seller_codes" in cols, "migration chain must add the column"
    con.execute(
        "INSERT INTO event (id, name, year, commission_rate, is_active, exempt_seller_codes)"
        " VALUES (1, 'Event 1', 2026, 0.30, 1, ?)",
        ("MYSL2" if with_exempt else None,),
    )
    con.commit()
    con.close()
    return path


def _run_bootstrap(scratch: Path) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["REGISTRY_URL"] = f"sqlite:///{scratch / 'registry.db'}"
    env["EVENTS_DIR"] = str(scratch / "events")
    env["JWT_SECRET_FILE"] = str(scratch / ".jwt_secret")
    env["DATABASE_URL"] = f"sqlite:///{scratch / 'legacy-swap.db'}"
    return subprocess.run(
        [sys.executable, str(BOOTSTRAP)],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


@pytest.fixture()
def scratch_env(tmp_path):
    (tmp_path / "events").mkdir(exist_ok=True)
    return tmp_path


def test_bootstrap_survives_fresh_boot(scratch_env):
    """THE outage regression: bootstrap must not crash on boot. A single
    broken unpack/format/SQL error anywhere in the boot path fails here
    before a deploy can take the daemon down."""
    scratch = scratch_env
    fn = _event_db_filename("Winter Swap 2026")
    _make_registry(scratch / "registry.db", [fn])
    _make_event_db(scratch / "events", fn, with_exempt=False)

    r = _run_bootstrap(scratch)
    assert r.returncode == 0, (
        "bootstrap crashed — this is exactly how the daemon went down for"
        f" PR #145. stdout:\n{r.stdout}\nstderr:\n{r.stderr}"
    )
    assert "Traceback" not in r.stderr, r.stderr


def test_bootstrap_syncs_exempt_codes_to_event_db(scratch_env):
    """The #145 sync block: registry-truth 'MYSL2' must heal a NULL mirror
    row in the event DB (the row reports actually read)."""
    scratch = scratch_env
    fn = _event_db_filename("Winter Swap 2026")
    _make_registry(scratch / "registry.db", [fn])
    ev_path = _make_event_db(scratch / "events", fn, with_exempt=False)

    r = _run_bootstrap(scratch)
    assert r.returncode == 0, r.stderr
    con = sqlite3.connect(ev_path)
    val = con.execute(
        "SELECT exempt_seller_codes FROM event WHERE id = 1"
    ).fetchone()[0]
    con.close()
    assert val == "MYSL2", (
        "bootstrap did not sync registry exempt_seller_codes onto the event DB"
    )
    assert "synced from registry" in r.stdout


def test_bootstrap_idempotent_second_run(scratch_env):
    """Boot twice: no crash, no duplicate work, sync line must NOT re-print
    (rows already agree)."""
    scratch = scratch_env
    fn = _event_db_filename("Winter Swap 2026")
    _make_registry(scratch / "registry.db", [fn])
    _make_event_db(scratch / "events", fn, with_exempt=False)

    assert _run_bootstrap(scratch).returncode == 0
    r2 = _run_bootstrap(scratch)
    assert r2.returncode == 0, r2.stderr
    assert "Traceback" not in r2.stderr
    assert "synced from registry" not in r2.stdout


def test_bootstrap_registry_row_shapes_must_all_unpack():
    """Static tripwire for the exact #145 failure mode: every `for ... in rows`
    loop in bootstrap.py must consume the full width of every SELECT that
    feeds it. Cheap regex check — not a substitute for the subprocess tests
    above, but catches the 'widened SELECT, forgot a loop' mistake at a
    glance even without running anything."""
    src = BOOTSTRAP.read_text()
    assert "SELECT id, db_filename, is_active, exempt_seller_codes" in src
    for line in src.splitlines():
        s = line.strip()
        if s.startswith("for (") and "in rows" in s:
            inner = s[s.index("(") + 1 : s.index(")")]
            n_fields = len([f for f in inner.split(",") if f.strip()])
            assert n_fields == 4, (
                f"rows unpack expects 4 columns, got {n_fields}: {s!r}"
            )
