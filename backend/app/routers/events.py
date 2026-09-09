"""Event management router — creates, lists, activates, and deletes swap events; requires admin role."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.models.user import User
from app.schemas.event import EventCreate, EventResponse

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=EventResponse, status_code=201)
def create_event(
    body: EventCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    """Create a new swap event."""
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
    """List all events in reverse chronological order."""
    return db.query(Event).order_by(Event.year.desc()).all()


@router.get("/active", response_model=EventResponse)
def get_active_event(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return the currently active event, for any authenticated user.

    Unlike the admin-only list/create endpoints, this lets cashiers and intake
    staff display the event name on checkout transactions and intake requests.
    """
    event = db.query(Event).filter(Event.is_active.is_(True)).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    return event


@router.post("/{event_id}/activate", response_model=EventResponse)
def activate_event(
    event_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    """Set an event as the active event, deactivating all others."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Deactivate all events, then activate the target. Bulk Query.update() keeps
    # the session's in-memory state in sync (synchronize_session="evaluate").
    db.query(Event).update({"is_active": False}, synchronize_session="evaluate")
    db.query(Event).filter(Event.id == event_id).update(
        {"is_active": True}, synchronize_session="evaluate"
    )
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    """Delete an inactive event and ALL of its data, permanently.

    Cascades (in FK order — SQLite does not enforce foreign keys here, so the
    children are removed explicitly): sale items, sales, items, intakes,
    sellers, and the event's user accounts. Intended for cleaning up duplicate
    or stale events; there is no undo.

    Guards:
      - The active event cannot be deleted (activate another event first).
      - The requesting admin cannot delete their own event: user accounts are
        event-scoped, so the cascade would delete the caller's own account and
        lock them out.
    """
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.is_active:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the active event. Activate another event first.",
        )
    if admin.event_id == event.id:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(
            status_code=400,
            detail=(
                "Cannot delete the event you are logged into — that would delete "
                "your own admin account. Log in as an admin of another event first."
            ),
        )

    event_name = event.name  # capture before the delete + commit expires it

    # 1) Sale items belonging to this event's sales.
    sale_ids = [row[0] for row in db.query(Sale.id).filter(Sale.event_id == event_id)]
    deleted_sale_items = (
        db.query(SaleItem)
        .filter(SaleItem.sale_id.in_(sale_ids))
        .delete(synchronize_session=False)
        if sale_ids
        else 0
    )
    deleted_sales = (
        db.query(Sale)
        .filter(Sale.event_id == event_id)
        .delete(synchronize_session=False)
    )

    # 2) Intakes/items hang off the event's sellers.
    seller_ids = [
        row[0] for row in db.query(Seller.id).filter(Seller.event_id == event_id)
    ]
    deleted_items = (
        db.query(Item)
        .filter(Item.seller_id.in_(seller_ids))
        .delete(synchronize_session=False)
        if seller_ids
        else 0
    )
    deleted_intakes = (
        db.query(Intake)
        .filter(Intake.seller_id.in_(seller_ids))
        .delete(synchronize_session=False)
        if seller_ids
        else 0
    )
    deleted_sellers = (
        db.query(Seller)
        .filter(Seller.event_id == event_id)
        .delete(synchronize_session=False)
    )

    # 3) User accounts are event-scoped (uq_user_event_username) — they go too.
    deleted_users = (
        db.query(User)
        .filter(User.event_id == event_id)
        .delete(synchronize_session=False)
    )

    db.delete(event)
    db.commit()

    return {
        "id": event_id,
        "name": event_name,
        "deleted": {
            "sale_items": deleted_sale_items,
            "sales": deleted_sales,
            "items": deleted_items,
            "intakes": deleted_intakes,
            "sellers": deleted_sellers,
            "users": deleted_users,
        },
    }
