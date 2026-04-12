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
from app.schemas.item import ItemLookupResponse, ItemResponse, ItemUpdate
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
        .filter(Item.id == item_id, Seller.event_id == event.id)
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
        .filter(Item.code == code, Seller.event_id == event.id)
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
        )
        .order_by(Item.code)
        .limit(20)
        .all()
    )
    return [
        ItemLookupResponse.model_validate({**item.__dict__, "seller_code": item.seller.code})
        for item in items
    ]


@router.get("/import-template")
def download_import_template(_user: User = Depends(_INTAKE_ADMIN)):
    """Return a blank Excel template for bulk item import."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([
        "Description", "Category", "Brand", "Type", "Color",
        "Size", "Gender/Age", "Year", "Price", "Used", "Donate if Unsold",
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
    """Delete an item that has not yet had its label printed or been sold."""
    item = _item_for_active_event(item_id, db)
    if item.label_printed:
        raise HTTPException(status_code=409, detail="Cannot delete item after label has been printed")
    if item.status != "available":
        raise HTTPException(status_code=409, detail="Cannot delete a sold item")
    db.delete(item)
    db.commit()
    return Response(status_code=204)
