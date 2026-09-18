"""Seller management router — registers and manages consignment sellers; requires admin or intake role."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
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
from app.services.codes import next_seller_code

router = APIRouter(prefix="/sellers", tags=["sellers"])

_INTAKE_ADMIN = require_roles("admin", "intake", "cashier_intake")


def _active_event(db: Session) -> Event:
    """Return the currently active event or raise 503 if none is configured."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    return event



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
    code = next_seller_code(db, body.first_name, body.last_name, body.company, body.is_vendor)
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
    changes = body.model_dump(exclude_unset=True)
    # Cross-field contract (same rules as SellerCreate), evaluated against the
    # RESULTING record: the patch wins when a field is present, the existing
    # value otherwise. Enforced here because SellerUpdate alone cannot see the
    # existing row (see its docstring). This makes the vendor/individual flag
    # safely editable: flipping it must leave a record that still satisfies
    # the identity + contact rules.
    vendor = bool(changes["is_vendor"]) if "is_vendor" in changes else bool(seller.is_vendor)
    company = str(changes.get("company", seller.company) or "")
    first_name = str(changes.get("first_name", seller.first_name) or "")
    last_name = str(changes.get("last_name", seller.last_name) or "")
    if vendor and not company.strip():
        raise HTTPException(
            status_code=422, detail="Company is required for vendor sellers"
        )
    if not vendor:
        if not first_name.strip():
            raise HTTPException(
                status_code=422,
                detail="First name is required for individual sellers",
            )
        if not last_name.strip():
            raise HTTPException(
                status_code=422,
                detail="Last name is required for individual sellers",
            )
    for field, value in changes.items():
        setattr(seller, field, value)
    db.commit()
    db.refresh(seller)
    return seller
