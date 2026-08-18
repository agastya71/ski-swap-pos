"""Seller management router — registers and manages consignment sellers; requires admin or intake role."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.models.user import User
from app.schemas.intake import IntakeResponse
from app.schemas.item import ItemResponse
from app.schemas.seller import SellerCreate, SellerResponse, SellerUpdate

router = APIRouter(prefix="/sellers", tags=["sellers"])

_INTAKE_ADMIN = require_roles("admin", "intake")


def _active_event(db: Session) -> Event:
    """Return the currently active event or raise 503 if none is configured."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    return event


def _next_seller_code(event_id: int, db: Session) -> str:
    """Return the next sequential 3-digit zero-padded seller code for the event."""
    max_code = (
        db.query(func.max(Seller.code))
        .filter(Seller.event_id == event_id)
        .scalar()
    )
    if max_code is None:
        return "001"
    try:
        next_num = int(max_code) + 1
    except (ValueError, TypeError):
        next_num = db.query(func.count(Seller.id)).filter(Seller.event_id == event_id).scalar() + 1
    return f"{next_num:03d}"


@router.get("", response_model=list[SellerResponse])
def list_sellers(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """List sellers for the active event, with optional search by code or name."""
    event = _active_event(db)
    query = db.query(Seller).filter(Seller.event_id == event.id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            Seller.code.ilike(like)
            | Seller.first_name.ilike(like)
            | Seller.last_name.ilike(like)
            | Seller.company.ilike(like)
        )
    return query.order_by(Seller.code).all()


@router.post("", response_model=SellerResponse, status_code=201)
def create_seller(
    body: SellerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_INTAKE_ADMIN),
):
    """Register a new seller for the active event with an auto-generated code."""
    event = _active_event(db)
    code = _next_seller_code(event.id, db)
    seller = Seller(
        **body.model_dump(),
        code=code,
        event_id=event.id,
        created_by=current_user.username,
    )
    db.add(seller)
    try:
        db.commit()
        db.refresh(seller)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Seller code conflict, please retry")
    return seller


@router.get("/{seller_id}", response_model=SellerResponse)
def get_seller(
    seller_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Return a single seller by ID within the active event."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return seller


@router.get("/{seller_id}/intakes", response_model=list[IntakeResponse])
def list_seller_intakes(
    seller_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """List all intake sessions associated with a given seller."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return (
        db.query(Intake)
        .filter(Intake.seller_id == seller_id)
        .order_by(Intake.id.desc())
        .all()
    )


@router.get("/{seller_id}/items", response_model=list[ItemResponse])
def list_seller_items(
    seller_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """List all items for a seller in the active event, ordered by item code."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    items = (
        db.query(Item)
        .join(Intake, Item.intake_id == Intake.id)
        .join(Seller, Intake.seller_id == Seller.id)
        .filter(
            Item.seller_id == seller_id,
            Seller.event_id == event.id,
            Item.is_deleted.is_(False),
        )
        .order_by(Item.code)
        .all()
    )
    return items


@router.patch("/{seller_id}", response_model=SellerResponse)
def update_seller(
    seller_id: int,
    body: SellerUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Update editable fields on an existing seller record."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(seller, field, value)
    db.commit()
    db.refresh(seller)
    return seller
