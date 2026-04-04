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
    event = _active_event(db)
    return create_sale_atomic(db, body, event, current_user.username)


@router.get("/{sale_id}", response_model=SaleWithItemsResponse)
def get_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(_CASHIER_ADMIN),
):
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
    event = _active_event(db)
    sale = db.query(Sale).filter(Sale.id == sale_id, Sale.event_id == event.id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    for sale_item in sale.sale_items:
        sale_item.item.status = "available"
    sale.is_voided = True
    db.commit()
    db.refresh(sale)
    return sale
