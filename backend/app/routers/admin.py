"""Admin router — provides database backup and other administrative utilities; requires admin role."""

import io
import json
import logging
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import func, inspect as sa_inspect, text
from sqlalchemy.orm import Session

import app.config as config
from app.database import engine, get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.user import User

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
    _user: User = Depends(_ADMIN_ONLY),
):
    """Export all database tables to a ZIP archive containing JSON and the raw SQLite file."""
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

    # JSON export of all tables
    json_path = backup_dir / f"{base_name}.json"
    inspector = sa_inspect(engine)
    all_data: dict = {}
    with engine.connect() as conn:
        for table_name in inspector.get_table_names():
            result = conn.execute(text(f'SELECT * FROM "{table_name}"'))
            all_data[table_name] = [dict(row._mapping) for row in result.fetchall()]
    json_path.write_text(json.dumps(all_data, default=_json_default, indent=2))

    # Build ZIP (SQLite file copy skipped for :memory: databases)
    db_file = Path(config.DATABASE_URL.replace("sqlite:///", "")).resolve()
    db_copy_path = None
    try:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            if ":memory:" not in str(config.DATABASE_URL):
                db_copy_path = backup_dir / f"{base_name}.db"
                shutil.copy2(db_file, db_copy_path)
                zf.write(db_copy_path, f"{base_name}.db")
            zf.write(json_path, f"{base_name}.json")

        zip_bytes = zip_buffer.getvalue()
        (backup_dir / f"{base_name}.zip").write_bytes(zip_bytes)
    except Exception:
        logger.exception("Backup failed; cleaning up partial artifacts")
        json_path.unlink(missing_ok=True)
        if db_copy_path is not None:
            db_copy_path.unlink(missing_ok=True)
        (backup_dir / f"{base_name}.zip").unlink(missing_ok=True)
        raise

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base_name}.zip"'},
    )
