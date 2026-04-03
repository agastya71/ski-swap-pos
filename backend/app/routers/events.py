from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCreate, EventResponse

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventResponse, status_code=201)
def create_event(
    body: EventCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    event = Event(**body.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=list[EventResponse])
def list_events(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    return db.query(Event).order_by(Event.year.desc()).all()


@router.post("/{event_id}/activate", response_model=EventResponse)
def activate_event(
    event_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Deactivate all, then activate the target
    db.query(Event).update({"is_active": False}, synchronize_session="evaluate")
    event.is_active = True
    db.commit()
    db.refresh(event)
    return event
