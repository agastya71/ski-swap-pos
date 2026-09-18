"""Admin router — provides database backup and other administrative utilities; requires admin role."""

import io
import json
import logging
import sqlite3
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import MetaData, Table, func, inspect as sa_inspect, select
from sqlalchemy.orm import Session

import app.config as config
from app.database import (
    current_event_engine,
    event_db_path,
    get_db,
    get_registry_db,
)
from app.dependencies import require_roles
from app.models.event import Event
from app.models.registry import RegistryUser

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)

_ADMIN_ONLY = require_roles("admin")


def _json_default(obj):
    """Serialize datetime and date objects to ISO 8601 strings for JSON export."""
    from datetime import date
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return str(obj)


@router.post("/backup")
def backup_database(
    db: Session = Depends(get_db),
    _user: RegistryUser = Depends(_ADMIN_ONLY),
):
    """Export all database tables to a ZIP archive containing JSON and the raw SQLite file.

    Phase G: backs up the ACTIVE event's database (data) plus the REGISTRY
    (event catalogue + shared accounts) — both files land in the ZIP.
    """
    backup_dir = Path(config.BACKUP_DIR)
    try:
        backup_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise HTTPException(
            status_code=500,
            detail=f"Backup directory is not writable: {backup_dir}",
        )

    max_year = db.query(func.max(Event.year)).scalar() or datetime.now().year
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    base_name = f"ski_swap_{max_year}_{timestamp}"

    # JSON export of all tables (active event DB)
    json_path = backup_dir / f"{base_name}.json"
    event_engine = current_event_engine()
    inspector = sa_inspect(event_engine)
    all_data: dict = {}
    metadata = MetaData()
    with event_engine.connect() as conn:
        for table_name in inspector.get_table_names():
            # Reflection + typed select() — no dynamic SQL string interpolation
            # (the avoid-sqlalchemy-text sink rule; table names come from the
            # DB's own schema, never user input).
            table = Table(table_name, metadata, autoload_with=conn)
            result = conn.execute(select(table))
            all_data[table_name] = [dict(row) for row in result.mappings().fetchall()]
    json_path.write_text(json.dumps(all_data, default=_json_default, indent=2))

    # Build ZIP (SQLite file copy skipped for :memory: databases)
    bound_path = event_db_path()
    db_file = Path(bound_path).resolve()
    db_copy_path = None
    registry_copy_path = None
    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            if ":memory:" not in str(bound_path):
                # SQLite backup API (not shutil.copy): with WAL enabled, copying
                # the raw file can miss commits sitting in the -wal file — the
                # backup API produces a consistent snapshot even while the
                # server is writing.
                db_copy_path = backup_dir / f"{base_name}.db"
                src = sqlite3.connect(str(db_file))
                try:
                    dst = sqlite3.connect(str(db_copy_path))
                    try:
                        src.backup(dst)
                    finally:
                        dst.close()
                finally:
                    src.close()
                zf.write(db_copy_path, f"{base_name}.db")
            zf.write(json_path, f"{base_name}.json")
            # Phase G: also snapshot the REGISTRY (event catalogue + accounts).
            registry_file = str(config.REGISTRY_URL).replace("sqlite:///", "", 1)
            if ":memory:" not in registry_file and Path(registry_file).exists():
                registry_copy_path = backup_dir / f"{base_name}_registry.db"
                src = sqlite3.connect(registry_file)
                try:
                    dst = sqlite3.connect(str(registry_copy_path))
                    try:
                        src.backup(dst)
                    finally:
                        dst.close()
                finally:
                    src.close()
                zf.write(registry_copy_path, "registry.db")

        zip_bytes = zip_buffer.getvalue()
        (backup_dir / f"{base_name}.zip").write_bytes(zip_bytes)
    except Exception:
        logger.exception("Backup failed; cleaning up partial artifacts")
        json_path.unlink(missing_ok=True)
        if db_copy_path is not None:
            db_copy_path.unlink(missing_ok=True)
        if registry_copy_path is not None:
            registry_copy_path.unlink(missing_ok=True)
        (backup_dir / f"{base_name}.zip").unlink(missing_ok=True)
        raise

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base_name}.zip"'},
    )
