"""Intake router — manages seller intake sessions and item ingestion; requires admin or intake role."""

import datetime
from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.models.user import User
from app.schemas.intake import IntakeCreate, IntakeResponse, IntakeUpdate, IntakeWithItemsResponse
from app.schemas.item import ImportResult, ImportRowError, ItemCreate, ItemResponse
from app.services.zpl import generate_zpl, send_to_printer

router = APIRouter(prefix="/intakes", tags=["intakes"])

_INTAKE_ADMIN = require_roles("admin", "intake")


def _active_event(db: Session) -> Event:
    """Return the currently active event or raise 503 if none is configured."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    return event


def _get_intake_for_event(intake_id: int, event_id: int, db: Session) -> Intake:
    """Fetch an intake that belongs to the given event, or raise 404."""
    intake = (
        db.query(Intake)
        .join(Seller)
        .filter(Intake.id == intake_id, Seller.event_id == event_id)
        .first()
    )
    if not intake:
        raise HTTPException(status_code=404, detail="Intake not found")
    return intake


@router.post("", response_model=IntakeResponse, status_code=201)
def create_intake(
    body: IntakeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_INTAKE_ADMIN),
):
    """Open a new intake session for a seller."""
    event = _active_event(db)
    seller = (
        db.query(Seller)
        .filter(Seller.id == body.seller_id, Seller.event_id == event.id)
        .first()
    )
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    intake = Intake(
        seller_id=body.seller_id,
        date_entered=body.date_entered or datetime.date.today(),
        date_received=body.date_received,
        # Explicit values win; null inherits the seller's per-seller defaults.
        donate_unsold=body.donate_unsold if body.donate_unsold is not None else seller.donate_unsold_default,
        donate_proceeds=body.donate_proceeds if body.donate_proceeds is not None else seller.donate_proceeds_default,
        created_by=current_user.username,
    )
    db.add(intake)
    db.commit()
    db.refresh(intake)
    return intake


@router.get("/{intake_id}", response_model=IntakeWithItemsResponse)
def get_intake(
    intake_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Return an intake session along with all its items."""
    event = _active_event(db)
    return _get_intake_for_event(intake_id, event.id, db)


def _next_item_code(seller_id: int, seller_code: str, db: Session) -> str:
    """Return the next sequential item code for a seller (e.g. '001-03').

    Computes numeric max in Python rather than relying on SQL string ordering,
    which is lexicographic and would break at sequence 10, 100, etc.
    """
    prefix = f"{seller_code}-"
    rows = (
        db.query(Item.code)
        .join(Intake, Item.intake_id == Intake.id)
        .filter(Intake.seller_id == seller_id, Item.code.like(f"{prefix}%"))
        .all()
    )
    if not rows:
        return f"{prefix}01"
    max_seq = max(int(row[0].rsplit("-", 1)[-1]) for row in rows)
    return f"{prefix}{max_seq + 1:02d}"


@router.post("/{intake_id}/items", response_model=ItemResponse, status_code=201)
def add_item_to_intake(
    intake_id: int,
    body: ItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_INTAKE_ADMIN),
):
    """Add a single item to an existing intake session with an auto-generated item code."""
    event = _active_event(db)
    intake = _get_intake_for_event(intake_id, event.id, db)
    seller = db.query(Seller).filter(Seller.id == intake.seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    item_code = _next_item_code(intake.seller_id, seller.code, db)
    # donate_unsold inherits from the intake (which itself inherits from the
    # seller's default) unless explicitly set on this item.
    donate_unsold = body.donate_unsold if body.donate_unsold is not None else intake.donate_unsold
    item = Item(
        intake_id=intake.id,
        seller_id=intake.seller_id,
        code=item_code,
        barcode_39=body.barcode_39 or item_code,
        created_by=current_user.username,
        **body.model_dump(exclude={"barcode_39", "donate_unsold"}),
        donate_unsold=donate_unsold,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{intake_id}/items/import", response_model=ImportResult)
def import_items_from_excel(
    intake_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(_INTAKE_ADMIN),
):
    """Bulk-import items into an intake session from an Excel/CSV/TSV template.

    Supports .xlsx, .csv, and .tsv. Brand values are matched to the closest
    existing brand in the event. Valid rows are committed; invalid rows are
    reported in the returned error list.
    """
    event = _active_event(db)
    intake = _get_intake_for_event(intake_id, event.id, db)
    seller = db.query(Seller).filter(Seller.id == intake.seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    data = file.file.read()
    try:
        from app.services.item_import import import_items as _import_items
        return _import_items(db, intake, seller, current_user.username, file.filename, data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/{intake_id}/labels")
def print_intake_labels(
    intake_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Print ZPL labels for all items in an intake session."""
    event = _active_event(db)
    intake = _get_intake_for_event(intake_id, event.id, db)
    printed = 0
    for item in intake.items:
        zpl = generate_zpl(item)
        try:
            send_to_printer(zpl)
        except OSError as e:
            raise HTTPException(status_code=503, detail=f"Printer unavailable: {e}")
        item.label_printed = True
        printed += 1
    db.commit()
    return {"intake_id": intake_id, "printed": printed}


@router.patch("/{intake_id}", response_model=IntakeResponse)
def update_intake(
    intake_id: int,
    body: IntakeUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Update metadata fields on an existing intake session."""
    event = _active_event(db)
    intake = _get_intake_for_event(intake_id, event.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(intake, field, value)
    db.commit()
    db.refresh(intake)
    return intake
