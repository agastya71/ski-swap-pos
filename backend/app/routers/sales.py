"""Sales router — processes point-of-sale transactions and void operations; requires cashier or admin role."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.sale import Sale
from app.models.user import User
from app.schemas.sale import SaleCreate, SaleResponse, SaleWithItemsResponse
from app.services.checkout import create_sale_atomic

router = APIRouter(prefix="/sales", tags=["sales"])

_CASHIER_ADMIN = require_roles("admin", "cashier")
_ADMIN_ONLY = require_roles("admin")


def _active_event(db: Session) -> Event:
    """Return the currently active event or raise 503 if none is configured."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    return event


@router.post("", response_model=SaleWithItemsResponse, status_code=201)
def create_sale(
    body: SaleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_CASHIER_ADMIN),
):
    """Record a new sale transaction and mark the purchased items as sold."""
    event = _active_event(db)
    return create_sale_atomic(db, body, event, current_user.username)


@router.get("/{sale_id}", response_model=SaleWithItemsResponse)
def get_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
    """Return details and line items for a single sale."""
    event = _active_event(db)
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.event_id == event.id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


@router.post("/{sale_id}/void", response_model=SaleResponse)
def void_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Void a sale and restore all its items' remaining units."""
    event = _active_event(db)
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.event_id == event.id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.is_voided:
        raise HTTPException(status_code=409, detail="Sale already voided")
    for sale_item in sale.sale_items:
        sale_item.item.remaining += sale_item.quantity
    sale.is_voided = True
    db.flush()
    # Recompute status per affected item: 'sold' if any non-voided sale_item
    # still references it, else 'available'.
    for sale_item in sale.sale_items:
        item = sale_item.item
        nonvoided_qty = sum(
            si.quantity for si in item.sale_items if not si.sale.is_voided
        )
        item.status = "sold" if nonvoided_qty > 0 else "available"
    db.commit()
    db.refresh(sale)
    return sale
