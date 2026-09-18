"""Event management router — the REGISTRY catalogue (Phase G).

Each event has its own SQLite database file (same data schema, at alembic
head) under ``backend/events/``; the registry row carries that filename. All
lifecycle helpers (create/migrate/delete/rebind) live in ``app.database``.
``POST /events`` creates the database file; ``POST /{id}/activate`` rebinds
the app's data engine to that file for ALL users (accounts are shared);
``DELETE /{id}`` removes an inactive event and its database file.
"""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import (
    create_event_db,
    delete_event_db,
    event_db_file,
    get_registry_db,
    rebind_event_db,
    slugify,
)
from app.dependencies import require_roles
from app.models.registry import RegistryEvent, RegistryUser
from app.schemas.event import EventCreate, EventResponse

router = APIRouter(prefix="/events", tags=["events"])

_AUTHENTICATED_ROLES = require_roles("admin", "intake", "cashier", "cashier_intake")


def _unique_db_filename(db: Session, name: str) -> str:
    """Slugified, registry-unique filename for a new event database."""
    base = slugify(name)
    candidate = f"{base}.db"
    n = 1
    while (
        db.query(RegistryEvent)  # pi-lens-ignore: python-sql-injection  (ORM parameterized filter; sink rule misfires)
        .filter(RegistryEvent.db_filename == candidate)
        .first()
        is not None
    ):
        n += 1
        candidate = f"{base}{n}.db"
    return candidate


@router.post("", response_model=EventResponse, status_code=201)
def create_event(
    body: EventCreate,
    db: Session = Depends(get_registry_db),
    _admin: RegistryUser = Depends(require_roles("admin")),
):
    """Create a new swap event — including its dedicated database file.

    The registry row is inserted first (to fix the event id), then the event
    database is created at alembic head with the SAME id as its own event row.
    """
    db_filename = _unique_db_filename(db, body.name)
    event = RegistryEvent(
        name=body.name,
        year=body.year,
        commission_rate=body.commission_rate,
        vendor_commission_rate=body.vendor_commission_rate,
        is_active=False,
        db_filename=db_filename,
    )
    db.add(event)
    db.flush()  # fix the registry id before the file is created
    event_id = getattr(event, "id", 0)
    try:
        create_event_db(
            db_filename,
            event_id=event_id,
            name=body.name,
            year=body.year,
            commission_rate=body.commission_rate,
            vendor_commission_rate=body.vendor_commission_rate,
        )
    except FileExistsError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:  # noqa: BLE001  (surface alembic/IO failures cleanly)
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Event database creation failed: {exc}"
        )
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=list[EventResponse])
def list_events(
    db: Session = Depends(get_registry_db),
    _admin: RegistryUser = Depends(require_roles("admin")),
):
    """List all events in reverse chronological order."""
    return db.query(RegistryEvent).order_by(RegistryEvent.year.desc()).all()


@router.get("/active", response_model=EventResponse)
def get_active_event(
    db: Session = Depends(get_registry_db),
    _user: RegistryUser = Depends(_AUTHENTICATED_ROLES),
):
    """Return the currently active event, for any authenticated user.

    Unlike the admin-only list/create endpoints, this lets cashiers and intake
    staff display the event name on checkout transactions and intake requests.
    """
    event = (
        db.query(RegistryEvent)  # pi-lens-ignore: python-sql-injection  (ORM parameterized filter; sink rule misfires)
        .filter(RegistryEvent.is_active == True)  # noqa: E712  (SQLAlchemy idiom)
        .first()
    )
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    return event


@router.post("/{event_id}/activate", response_model=EventResponse)
def activate_event(
    event_id: int,
    db: Session = Depends(get_registry_db),
    _admin: RegistryUser = Depends(require_roles("admin")),
):
    """Set an event as the active event, deactivating all others.

    Rebinds the app's data engine to that event's database file — the switch
    applies to ALL users (shared accounts; nobody re-logs in).
    """
    event = (
        db.query(RegistryEvent)  # pi-lens-ignore: python-sql-injection  (ORM parameterized filter; sink rule misfires)
        .filter(RegistryEvent.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db_filename = str(event.db_filename)  # pyright: ignore[reportArgumentType]
    path = event_db_file(db_filename)
    if not Path(path).exists():
        raise HTTPException(
            status_code=500,
            detail=f"Event database file is missing: {path}",
        )

    # Deactivate all events, then activate the target. Bulk Query.update() keeps
    # the session's in-memory state in sync (synchronize_session="evaluate").
    db.query(RegistryEvent).update({"is_active": False}, synchronize_session="evaluate")
    (
        db.query(RegistryEvent)  # pi-lens-ignore: python-sql-injection  (ORM parameterized filter; sink rule misfires)
        .filter(RegistryEvent.id == event_id)
        .update({"is_active": True}, synchronize_session="evaluate")
    )
    db.commit()
    db.refresh(event)

    rebind_event_db(path)
    return event


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    db: Session = Depends(get_registry_db),
    admin: RegistryUser = Depends(require_roles("admin")),
):
    """Delete an INACTIVE event and its dedicated database file, permanently.

    Phase G: the data lives in the event's own database file, so deletion is
    simply removing the file and the registry row (no cross-table cascade).
    Guards: the active event cannot be deleted (activate another first). The
    old caller-own-event lockout guard is obsolete — accounts are shared and
    are NOT stored in event databases.
    """
    event = (
        db.query(RegistryEvent)  # pi-lens-ignore: python-sql-injection  (ORM parameterized filter; sink rule misfires)
        .filter(RegistryEvent.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.is_active:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the active event. Activate another event first.",
        )

    db_filename = str(event.db_filename)  # pyright: ignore[reportArgumentType]
    event_name = str(event.name)  # capture before the delete expires the row
    delete_event_db(db_filename)
    db.delete(event)
    db.commit()
    return {"deleted": event_id, "name": event_name, "db_filename": db_filename}