"""Item router — manages individual consignment items for lookup, editing, and printing; requires admin, intake, or cashier role."""

from io import BytesIO

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller
from app.models.user import User
from app.schemas.item import ItemLookupResponse, ItemQuantityAdjustment, ItemResponse, ItemUpdate
from app.services.zpl import generate_zpl, send_to_printer

router = APIRouter(prefix="/items", tags=["items"])

_INTAKE_ADMIN = require_roles("admin", "intake")
_CASHIER_ADMIN = require_roles("admin", "cashier")


def _item_for_active_event(item_id: int, db: Session) -> Item:
    """Fetch an item belonging to the active event, or raise 503/404 as appropriate."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    item = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(Item.id == item_id, Seller.event_id == event.id, Item.is_deleted.is_(False))
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.get("/lookup", response_model=ItemLookupResponse)
def lookup_item(
    code: str,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    """Look up a single item by its exact item code for point-of-sale scanning."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    item = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(Item.code == code, Seller.event_id == event.id, Item.is_deleted.is_(False))
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemLookupResponse.model_validate({**item.__dict__, "seller_code": item.seller.code})


@router.get("/search", response_model=list[ItemLookupResponse])
def search_items(
    q: str,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    """Search items by partial match on code, description, category, brand, or seller code."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    like = f"%{q}%"
    items = (
        db.query(Item)
        .join(Intake)
        .join(Seller)
        .filter(
            (Item.code.ilike(like))
            | (Item.description.ilike(like))
            | (Item.category.ilike(like))
            | (Item.brand.ilike(like))
            | (Seller.code.ilike(like)),
            Seller.event_id == event.id,
            Item.is_deleted.is_(False),
        )
        .order_by(Item.code)
        .limit(20)
        .all()
    )
    return [
        ItemLookupResponse.model_validate({**item.__dict__, "seller_code": item.seller.code})
        for item in items
    ]


@router.get("/brands", response_model=list[str])
def list_brands(
    q: str = "",
    category: str = "",
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    """Return distinct brand names for the active event, optionally filtered by
    prefix and/or by category (brands that have been assigned to that category).

    Used by the POS/intake brand typeahead to suggest close alternatives; the
    intake form passes the selected category so only category-appropriate
    brands are offered (case-insensitive match on the stored category).
    """
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    query = (
        db.query(Item.brand)
        .join(Intake)
        .join(Seller)
        .filter(Seller.event_id == event.id, Item.is_deleted.is_(False), Item.brand.isnot(None))
        .distinct()
    )
    if q.strip():
        query = query.filter(Item.brand.ilike(f"%{q.strip()}%"))
    if category.strip():
        query = query.filter(Item.category.ilike(category.strip()))
    return [b[0] for b in query.order_by(Item.brand).all() if b[0]]

@router.get("/import-template")
def download_import_template(_user: User = Depends(_INTAKE_ADMIN)):
    """Return a blank Excel template for bulk item import.

    Columns: Description, Category, Brand, Type, Color, Size, Gender/Age, Year,
    Price, Used, Donate if Unsold, Quantity. Quantity (blank = 1) represents
    how many identical units one row covers.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([
        "Description", "Category", "Brand", "Type", "Color",
        "Size", "Gender/Age", "Year", "Price", "Used", "Donate if Unsold", "Quantity",
    ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=import-template.xlsx"},
    )


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Return full details for a single item."""
    return _item_for_active_event(item_id, db)


@router.patch("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    body: ItemUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Update editable fields on an item such as price or description."""
    item = _item_for_active_event(item_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/label", response_model=ItemResponse)
def print_item_label(
    item_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Send a ZPL label for the item to the configured label printer."""
    item = _item_for_active_event(item_id, db)
    zpl = generate_zpl(item)
    try:
        send_to_printer(zpl)
    except OSError as e:
        raise HTTPException(status_code=503, detail=f"Printer unavailable: {e}")
    item.label_printed = True
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Soft-delete an item that has not yet had its label printed or been sold.

    Sets ``is_deleted=True``; the row is retained for audit. Allowed only when
    the item is not label-printed and is still ``available`` (no sales). Sold
    or partially-sold items cannot be deleted.
    """
    item = _item_for_active_event(item_id, db)
    if item.label_printed:
        raise HTTPException(status_code=409, detail="Cannot delete item after label has been printed")
    if item.status != "available":
        raise HTTPException(status_code=409, detail="Cannot delete an item that has been sold")
    item.is_deleted = True
    db.commit()
    return Response(status_code=204)


@router.patch("/{item_id}/quantity", response_model=ItemResponse)
def adjust_item_quantity(
    item_id: int,
    body: ItemQuantityAdjustment,
    db: Session = Depends(get_db),
    _user: User = Depends(_INTAKE_ADMIN),
):
    """Adjust an item's on-hand remaining quantity by a signed delta.

    This corrects the CONSIGNMENT COUNT: the same delta is applied to BOTH
    ``quantity`` (original intake units) and ``remaining`` (on-hand units), so
    the invariant ``remaining = quantity − sold`` — enforced by the start.sh
    re-sync — survives manual corrections. The result may not fall below 0
    (already-sold units are tracked via sale_item and cannot be adjusted out).
    """
    item = _item_for_active_event(item_id, db)
    new_remaining = item.remaining + body.adjustment
    # item.remaining is the on-hand sellable count; floor is 0 (sold units are
    # tracked via sale_item and cannot be adjusted away).
    if new_remaining < 0:
        raise HTTPException(
            status_code=422,
            detail="Quantity cannot be reduced below zero (would imply fewer units than already sold)",
        )
    item.remaining = new_remaining
    item.quantity = item.quantity + body.adjustment
    db.commit()
    db.refresh(item)
    return item
