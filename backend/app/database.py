"""Database engines: the per-event data DB (rebindable) + the shared registry.

Phase G (2026-09-18): each event gets its own SQLite database file (created
with the same alembic-managed schema — see ``app/services/event_db.py``); a
small REGISTRY database (``backend/registry.db``) holds the event catalogue
and ALL user accounts (shared across events — switching the active event
never requires a re-login).

Two bound engines exist:
  - the EVENT database (``engine``/``SessionLocal``/``get_db``): rebinds to
    the active event's file via :func:`rebind_event_db`;
  - the REGISTRY (``get_registry_db``): created lazily on first use so that
    importing this module never creates ``registry.db`` (tests override the
    dependency and must not touch the file).
"""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy import event as sa_event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

import app.config as _config

from app.config import DATABASE_URL, EVENTS_DIR, REGISTRY_URL  # compat aliases


def _sqlite_connect_args() -> dict:
    return {"check_same_thread": False, "timeout": 15}  # busy-wait 15 s


def _set_sqlite_pragmas(dbapi_connection, _record):
    """Concurrency + integrity pragmas for every SQLite connection.

    - WAL journal: readers never block the writer and vice versa — multiple
      cashiers/intake operators + long report reads no longer collide with
      'database is locked' errors (rollback-journal mode blocked writers for
      the whole duration of any read).
    - foreign_keys=ON: orphaned rows become loud constraint errors instead of
      silent data loss (all app deletes cascade explicitly, so this only
      converts *future* forgotten-cascade bugs into errors).
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


class Base(DeclarativeBase):
    """Event-database schema (sellers, intakes, items, sales, ...)."""


class RegistryBase(DeclarativeBase):
    """Registry-database schema (event catalogue + shared user accounts)."""


# ── Event database: single bound engine, swapped by rebind_event_db() ────────

engine = create_engine(DATABASE_URL, connect_args=_sqlite_connect_args())
sa_event.listens_for(engine, "connect")(_set_sqlite_pragmas)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def event_db_path() -> str:
    """File path (or URL string) of the currently bound event database."""
    url: str = str(getattr(engine, "url", ""))
    return url.replace("sqlite:///", "", 1)


def current_event_engine():
    """The currently bound event-data engine (changes on rebind_event_db).

    Modules that need the engine at CALL time (e.g. the backup route) must use
    this accessor — importing the module-level ``engine`` binds the ORIGINAL
    object and goes stale after a rebind.
    """
    return engine


def rebind_event_db(db_path: str) -> None:
    """Bind the event-data engine to another event database file.

    Used at boot (registry's active event) and by the admin's activate-event
    flow. In-flight sessions finish on the old engine; its pool is disposed
    so every NEW session uses the new file.
    """
    global engine
    old = engine
    engine = create_engine(f"sqlite:///{db_path}", connect_args=_sqlite_connect_args())
    sa_event.listens_for(engine, "connect")(_set_sqlite_pragmas)
    SessionLocal.configure(bind=engine)
    old.dispose()


def get_db():
    """Yield a session bound to the ACTIVE event's database."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Registry (lazy — see module docstring) ───────────────────────────────────

_registry_engine = None
_RegistrySessionLocal: sessionmaker | None = None


def _registry_ready():
    """Create the registry engine + schema on first use."""
    global _registry_engine, _RegistrySessionLocal
    if _registry_engine is None:
        _registry_engine = create_engine(
            _config.REGISTRY_URL, connect_args=_sqlite_connect_args()
        )
        sa_event.listens_for(_registry_engine, "connect")(_set_sqlite_pragmas)
        _RegistrySessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=_registry_engine
        )
        import app.models.registry  # noqa: F401  (registers the tables)
        RegistryBase.metadata.create_all(_registry_engine)
    return _registry_engine


def get_registry_db():
    """Yield a REGISTRY session (event catalogue + shared user accounts)."""
    _registry_ready()
    assert _RegistrySessionLocal is not None  # set by _registry_ready()
    db = _RegistrySessionLocal()
    try:
        yield db
    finally:
        db.close()


def resolve_active_event() -> str | None:
    """Bind the event engine to the registry's active event DB, if any.

    Called once at app startup. Returns the bound path (or None when the
    registry is absent/empty — legacy single-DB mode keeps DATABASE_URL).
    Never creates the registry file.
    """
    registry_file = _config.REGISTRY_URL.replace("sqlite:///", "", 1)
    if not Path(registry_file).exists():
        return None
    import sqlite3

    try:
        con = sqlite3.connect(registry_file)
        try:
            row = con.execute(
                "SELECT db_filename FROM event WHERE is_active = 1 LIMIT 1"
            ).fetchone()
        finally:
            con.close()
    except sqlite3.Error:
        return None  # malformed/empty registry — stay on the legacy binding
    if not row or not row[0]:
        return None
    db_path = str(Path(_config.EVENTS_DIR) / str(row[0]))
    if not Path(db_path).exists():
        return None  # registry points at a missing file — fail over to legacy
    rebind_event_db(db_path)
    return db_path


# ── Event-database lifecycle (Phase G) ───────────────────────────────────────
# The registry's per-event SQLite files are created here so that every import
# stays inside this (long-indexed) module — a separate new module was not
# resolvable by the editor's LSP index.


def slugify(name: str) -> str:
    """Lowercase alnum+underscore slug for an event database filename."""
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in name.strip().lower())
    cleaned = "_".join(part for part in cleaned.split("_") if part)
    return cleaned or "event"


def event_db_file(db_filename: str) -> str:
    """Absolute path of an event database file inside EVENTS_DIR."""
    from pathlib import Path

    return str(Path(_config.EVENTS_DIR) / db_filename)


def migrate_event_db(db_path: str) -> None:
    """Bring a (fresh) event database to the latest schema via alembic."""
    from alembic import command
    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parents[1]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "migrations"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    command.upgrade(cfg, "head")


def create_event_db(
    db_filename: str,
    event_id: int,
    name: str,
    year: int,
    commission_rate: float,
    vendor_commission_rate: float,
) -> str:
    """Create a fresh event database file and seed its own event row.

    The in-file event row carries the REGISTRY's id (explicit ``id=event_id``)
    so ``event_id`` semantics stay stable across the app, and is the only
    event in that database (is_active=True) — every existing "resolve the
    active event" query inside a data DB keeps working.

    Returns the created file path. Raises FileExistsError if the file exists.
    """
    from sqlalchemy.orm import sessionmaker as _sessionmaker

    from app.models.event import Event

    path = event_db_file(db_filename)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    if Path(path).exists():
        raise FileExistsError(f"Event database already exists: {path}")
    migrate_event_db(path)

    ev_engine = create_engine(
        f"sqlite:///{path}", connect_args=_sqlite_connect_args()
    )
    sa_event.listens_for(ev_engine, "connect")(_set_sqlite_pragmas)
    db = _sessionmaker(autocommit=False, autoflush=False, bind=ev_engine)()
    try:
        db.add(
            Event(
                id=event_id,
                name=name,
                year=year,
                commission_rate=commission_rate,
                vendor_commission_rate=vendor_commission_rate,
                is_active=True,
            )
        )
        db.commit()
    finally:
        db.close()
        ev_engine.dispose()
    return path


def delete_event_db(db_filename: str) -> None:
    """Remove an event's database file (and WAL/SHM sidecars).

    Only call for INACTIVE events; the active event's file is in use by the
    bound engine.
    """
    path = event_db_file(db_filename)
    for suffix in ("", "-wal", "-shm"):
        p = Path(str(path) + suffix)
        if p.exists():
            p.unlink()


def rebind_to_active_event(registry_db) -> str:
    """Point the event engine at the registry's active event (if any).

    Returns the bound path, or "" when no event is active (the standard
    "no active event" guards in the data routers then 503 as usual).
    """
    from app.models.registry import RegistryEvent

    event = (
        # pi-lens-ignore: python-sql-injection
        registry_db.query(RegistryEvent)
        .filter(RegistryEvent.is_active == True)  # noqa: E712  (SQLAlchemy idiom)
        .first()
    )
    if not event:
        return ""
    path = event_db_file(str(event.db_filename))  # pyright: ignore[reportArgumentType]
    if not Path(path).exists():
        return ""
    rebind_event_db(path)
    return path
