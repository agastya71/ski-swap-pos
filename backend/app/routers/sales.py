"""Sales router — processes point-of-sale transactions, transaction editing
(line add/update/remove + payment/info fixes, audited), and void operations;
requires cashier or admin role."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.sale import Sale
from app.models.user import User
from app.schemas.sale import (
    SaleCreate,
    SaleEditResponse,
    SaleItemCreate,
    SaleLineEdit,
    SaleResponse,
    SaleUpdate,
    SaleWithItemsResponse,
)
from app.services.checkout import create_sale_atomic
from app.services import sale_edit as editing

router = APIRouter(prefix="/sales", tags=["sales"])

_CASHIER_ADMIN = require_roles("admin", "cashier", "cashier_intake")
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
    return create_sale_atomic(db, body, event, current_user.username)  # pyright: ignore[reportArgumentType]


@router.get("", response_model=list[SaleWithItemsResponse])
def list_sales(
    limit: int = 50,
    offset: int = 0,
    created_by: str | None = None,
    include_voided: bool = False,
    db: Session = Depends(get_db),
    _user: User = Depends(_ADMIN_ONLY),
):
    """Admin: list the active event's sales, newest first, for the
    transactions page. Paginated; ``created_by`` filters per cashier;
    voided sales are excluded unless ``include_voided`` is set (they stay
    flagged in every response via ``is_voided``)."""
    event = _active_event(db)
    query = (
        db.query(Sale)
        .filter(Sale.event_id == event.id)
        .options(joinedload(Sale.sale_items))
        .order_by(Sale.id.desc())
    )
    if created_by:
        query = query.filter(Sale.created_by == created_by)
    if not include_voided:
        query = query.filter(Sale.is_voided == False)  # noqa: E712
    return query.limit(limit).offset(offset).all()


@router.get("/mine", response_model=list[SaleWithItemsResponse])
def get_my_sales(
    db: Session = Depends(get_db),
    current_user: User = Depends(_CASHIER_ADMIN),
):
    """Return the caller's own sales for the active event, newest first, with
    all line items — read-only self-service transaction history for the
    cashier ("my transactions"). Voided sales are included and flagged via
    ``is_voided``. Register before "/{sale_id}" so 'mine' is not captured by
    the int path parameter.
    """
    event = _active_event(db)
    sales = (
        db.query(Sale)
        .filter(
            Sale.event_id == event.id,
            Sale.created_by == current_user.username,
        )
        .options(joinedload(Sale.sale_items))
        .order_by(Sale.id.desc())
        .all()
    )
    return sales


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
    if sale.is_voided:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(status_code=409, detail="Sale already voided")
    for sale_item in sale.sale_items:
        sale_item.item.remaining += sale_item.quantity
    sale.is_voided = True  # pyright: ignore[reportAttributeAccessIssue]
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


# ── Transaction editing (docs/superpowers/specs/2026-10-25-transaction-editing-design.md)
# Every route here is guarded by load_editable_sale inside the service:
# 404 unknown/wrong-event sale · 409 voided sales are immutable ·
# 403 non-admin role must own the sale (D1). Totals + per-line commission are
# recomputed exactly like create_sale_atomic; every change appends a
# `sale_edit` audit row.


@router.patch("/{sale_id}", response_model=SaleWithItemsResponse)
def edit_sale(
    sale_id: int,
    body: SaleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_CASHIER_ADMIN),
):
    """Correct a completed sale's payment tender and/or customer info fields.

    Omitted fields are unchanged; total_paid / balance_due are recomputed on
    save (negative balance_due = change already handed back)."""
    event = _active_event(db)
    return editing.update_sale(db, event, sale_id, current_user, body)  # pyright: ignore[reportArgumentType]


@router.post("/{sale_id}/lines", response_model=SaleWithItemsResponse, status_code=201)
def add_sale_line(
    sale_id: int,
    body: SaleItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_CASHIER_ADMIN),
):
    """Append a line item to a completed sale (stock- and duplicate-checked
    exactly like checkout; the item's remaining units are decremented)."""
    event = _active_event(db)
    return editing.add_line(db, event, sale_id, current_user, body)  # pyright: ignore[reportArgumentType]


@router.patch("/{sale_id}/lines/{sale_item_id}", response_model=SaleWithItemsResponse)
def edit_sale_line(
    sale_id: int,
    sale_item_id: int,
    body: SaleLineEdit,
    db: Session = Depends(get_db),
    current_user: User = Depends(_CASHIER_ADMIN),
):
    """Change one completed sale line's quantity / sell_price / notes; stock
    moves in/out of the item's remaining units and totals are recomputed."""
    event = _active_event(db)
    return editing.update_line(db, event, sale_id, sale_item_id, current_user, body)  # pyright: ignore[reportArgumentType]


@router.delete("/{sale_id}/lines/{sale_item_id}", response_model=SaleWithItemsResponse)
def remove_sale_line(
    sale_id: int,
    sale_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_CASHIER_ADMIN),
):
    """Remove a line from a completed sale: its units return to the item's
    remaining stock; the removed line is preserved in the sale's audit
    history. A sale always keeps at least one line (D8) — void it instead."""
    event = _active_event(db)
    return editing.remove_line(db, event, sale_id, sale_item_id, current_user)  # pyright: ignore[reportArgumentType]


@router.get("/{sale_id}/edits", response_model=list[SaleEditResponse])
def get_sale_edits(
    sale_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_CASHIER_ADMIN),
):
    """Audit history for one sale, newest first (who / when / what changed).
    Read-only and viewable even for voided sales, to admins and to the
    cashier who recorded the sale."""
    event = _active_event(db)
    editing.load_viewable_sale(db, event, sale_id, current_user)
    from app.models.sale_edit import SaleEdit

    return (
        db.query(SaleEdit)
        .filter(SaleEdit.sale_id == sale_id)
        .order_by(SaleEdit.id.desc())
        .all()
    )
