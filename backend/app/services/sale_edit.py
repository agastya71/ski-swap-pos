"""Sale editing service — true transaction editing for corrections.

Lets a cashier (or cashier_intake) fix mistakes on THEIR OWN completed sale
and an admin fix ANY completed sale in the active event: add / update /
remove line items and correct payment or customer fields. Every operation
follows the checkout pattern: validate BEFORE mutating, apply within one
transaction, recompute the sale's money totals with the exact same math as
``create_sale_atomic`` (per-line ``compute_commission``), and append an
audit row to ``sale_edit`` describing what changed.

Stock invariants (see docs/superpowers/specs/2026-10-25-transaction-editing-design.md):

- adding lines / raising a line's quantity withdraws units and requires
  ``item.remaining >= added units`` (422 mirrors checkout's wording);
- removing lines / lowering quantity RESTORES units, never beyond the intake
  quantity (``remaining <= quantity`` at all times);
- item.status stays "sold" while any non-voided sale line references the item,
  otherwise returns to "available" (same rule as void);
- a sale always keeps at least one line — the last line's removal returns 422
  (void the sale instead);
- voided sales are immutable (409) — re-enter a new sale instead;
- removed lines are hard-deleted (reports stay correct) and preserved in the
  audit row's ``before`` snapshot.
"""

import datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_edit import SaleEdit
from app.models.sale_item import SaleItem
from app.models.user import User
from app.schemas.sale import SaleItemCreate, SaleLineEdit, SaleUpdate
from app.services.checkout import compute_commission, compute_card_fee


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _is_admin(user: User) -> bool:
    return user.role == "admin"


def _line_snapshot(sale_item: SaleItem) -> dict:
    """JSON snapshot of a sale line for the audit trail."""
    return {
        "id": sale_item.id,
        "item_id": sale_item.item_id,
        "item_code": sale_item.item_code,
        "line_number": sale_item.line_number,
        "quantity": sale_item.quantity,
        "sell_price": sale_item.sell_price,
        "extended_price": sale_item.extended_price,
        "notes": sale_item.notes,
    }


def _payment_snapshot(sale: Sale) -> dict:
    return {
        "cash_amount": sale.cash_amount,
        "check_amount": sale.check_amount,
        "check_number": sale.check_number,
        "cc_amount": sale.cc_amount,
        "cc_fee": sale.cc_fee,
        "cc_transaction_id": sale.cc_transaction_id,
    }


def _info_snapshot(sale: Sale) -> dict:
    return {
        "customer_name": sale.customer_name,
        "customer_email": sale.customer_email,
        "notes": sale.notes,
    }


def _audit(
    db: Session,
    sale: Sale,
    action: str,
    edited_by: str,
    before: dict | None = None,
    after: dict | None = None,
    sale_item_id: int | None = None,
) -> None:
    db.add(SaleEdit(
        sale_id=sale.id,
        sale_item_id=sale_item_id,
        action=action,
        before=before,
        after=after,
        edited_by=edited_by,
        edited_at=_now(),
    ))


def load_editable_sale(db: Session, event: Event, sale_id: int, current_user: User) -> Sale:
    """Load the sale from the active event, guarded per the editing contract.

    Raises: 404 (unknown sale / wrong event), 409 (voided sales are immutable),
    403 (non-admin must edit only their own sale — D1).
    """
    sale = _load_sale(db, event, sale_id)
    if sale.is_voided:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(status_code=409, detail="Sale already voided")
    _check_ownership(sale, current_user)
    return sale


def load_viewable_sale(db: Session, event: Event, sale_id: int, current_user: User) -> Sale:
    """Like ``load_editable_sale`` but allows reading VOIDED sales — the
    audit history of a voided sale stays viewable (read-only) to its cashier
    and to admins; only MUTATION is blocked."""
    sale = _load_sale(db, event, sale_id)
    _check_ownership(sale, current_user)
    return sale


def _load_sale(db: Session, event: Event, sale_id: int) -> Sale:
    sale = (
        db.query(Sale)
        .filter(Sale.id == sale_id, Sale.event_id == event.id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale


def _check_ownership(sale: Sale, current_user: User) -> None:
    if not _is_admin(current_user) and sale.created_by != current_user.username:
        raise HTTPException(status_code=403, detail="You can only edit your own transactions")


def _item_status(db: Session, item: Item) -> None:
    """Recompute item.status after a stock change (same rule as void).

    Queries the DB (post-flush) instead of the in-memory ``item.sale_items``
    collection — a just-added or just-deleted line may not be reflected in
    the relationship's loaded state."""
    nonvoided_qty = (
        db.query(func.sum(SaleItem.quantity))
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(SaleItem.item_id == item.id, Sale.is_voided == False)  # noqa: E712
        .scalar()
    ) or 0.0
    item.status = "sold" if nonvoided_qty > 0 else "available"


def _recompute_totals(db: Session, sale: Sale, event: Event) -> None:
    """Recompute sale_total / mysl_total / seller_total exactly like checkout.

    Queries the DB (post-flush) instead of the in-memory ``sale.sale_items``
    collection — a just-added or just-deleted line may not be reflected in
    the relationship's loaded state. As in checkout, the card fee (derived
    from the recorded card charge) rides on top of the line totals in
    ``sale_total`` and is retained by MYSL inside ``mysl_total``; seller
    payouts stay the commission split of the line prices only."""
    rows = db.query(SaleItem).filter(SaleItem.sale_id == sale.id).all()
    sale_total = 0.0
    mysl_total = 0.0
    seller_total = 0.0
    for si in rows:
        extended = round(si.extended_price, 2)
        item = db.query(Item).filter(Item.id == si.item_id).first()
        intake = item.intake if item is not None else None
        donate = bool(intake.donate_proceeds) if intake is not None else False
        mysl_share, seller_share = compute_commission(extended, donate, event.commission_rate)
        sale_total += extended
        mysl_total += mysl_share
        seller_total += seller_share
    cc_fee = compute_card_fee(sale.cc_amount or 0.0)
    sale.cc_fee = cc_fee
    sale.sale_total = round(sale_total + cc_fee, 2)
    sale.mysl_total = round(mysl_total + cc_fee, 2)
    sale.seller_total = round(seller_total, 2)


def _settle_line_math(sale_item: SaleItem) -> None:
    """Refresh extended_price + line_number bookkeeping after an edit of one line."""
    sale_item.extended_price = round(sale_item.sell_price * sale_item.quantity, 2)


def add_line(db: Session, event: Event, sale_id: int, current_user: User, payload: SaleItemCreate) -> Sale:
    """Append a line item to a completed sale (stock-checked like checkout)."""
    sale = load_editable_sale(db, event, sale_id, current_user)
    existing_item_ids = {si.item_id for si in sale.sale_items}
    if payload.item_id in existing_item_ids:
        raise HTTPException(status_code=422, detail="Duplicate item: it is already on this sale — adjust its line quantity instead")

    # Item scoping mirrors create_sale_atomic: exact id, event-owned seller,
    # not soft-deleted, enough remaining units.
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if item is None or item.seller.event_id != event.id:
        raise HTTPException(status_code=404, detail=f"Item {payload.item_id} not found")
    if item.is_deleted:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(status_code=422, detail=f"Item {item.code} is deleted")
    if item.remaining < payload.quantity:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(
            status_code=422,
            detail=f"Item {item.code} has only {getattr(item, 'remaining')} remaining",
        )

    sell_price = payload.sell_price if payload.sell_price is not None else item.price
    sale_item = SaleItem(
        sale_id=sale.id,
        item_id=item.id,
        line_number=(max((si.line_number or 0) for si in sale.sale_items) + 1) if sale.sale_items else 1,
        quantity=payload.quantity,
        sell_price=sell_price,
        extended_price=round(sell_price * payload.quantity, 2),
        notes=payload.notes,
        created_by=current_user.username,
    )
    sale.sale_items.append(sale_item)   # keep the in-memory collection coherent too
    db.add(sale_item)
    db.flush()
    item.remaining -= payload.quantity
    _item_status(db, item)
    _recompute_totals(db, sale, event)
    _audit(
        db, sale, "add_line", current_user.username,
        before=None, after=_line_snapshot(sale_item), sale_item_id=sale_item.id,
    )
    db.commit()
    db.refresh(sale)
    return sale


def update_line(
    db: Session, event: Event, sale_id: int, sale_item_id: int, current_user: User,
    payload: SaleLineEdit,
) -> Sale:
    """Change a completed sale line's quantity / sell_price / notes.

    Quantity changes move units in/out of item.remaining with the stock
    invariants; any change recomputes extended price, per-line commission and
    the sale totals (D3: touched lines only, current event rate).
    """
    sale = load_editable_sale(db, event, sale_id, current_user)
    sale_item = next((si for si in sale.sale_items if si.id == sale_item_id), None)
    if sale_item is None:
        raise HTTPException(status_code=404, detail="Sale line not found")

    before = _line_snapshot(sale_item)
    changed = False

    if payload.quantity is not None and payload.quantity != sale_item.quantity:
        item = sale_item.item
        delta = payload.quantity - sale_item.quantity
        if delta > 0:
            if item.remaining < delta:  # pyright: ignore[reportGeneralTypeIssues]
                raise HTTPException(
                    status_code=422,
                    detail=f"Item {item.code} has only {getattr(item, 'remaining')} remaining",
                )
            item.remaining -= delta
        else:
            if item.remaining - delta > item.quantity:  # pyright: ignore[reportGeneralTypeIssues]
                raise HTTPException(
                    status_code=422,
                    detail=f"Item {item.code} cannot return more than its intake quantity of {item.quantity}",
                )
            item.remaining -= delta  # delta < 0: restores units
        sale_item.quantity = payload.quantity
        _item_status(db, item)
        changed = True

    if payload.sell_price is not None and payload.sell_price != sale_item.sell_price:
        sale_item.sell_price = payload.sell_price
        changed = True

    if payload.notes is not None and payload.notes != sale_item.notes:
        sale_item.notes = payload.notes
        changed = True

    if changed:
        _settle_line_math(sale_item)
        _recompute_totals(db, sale, event)
        _audit(
            db, sale, "update_line", current_user.username,
            before=before, after=_line_snapshot(sale_item), sale_item_id=sale_item.id,
        )
        db.commit()
        db.refresh(sale)
    return sale


def remove_line(db: Session, event: Event, sale_id: int, sale_item_id: int, current_user: User) -> Sale:
    """Remove a line: restore its units, delete the row (D2), audit the snapshot."""
    sale = load_editable_sale(db, event, sale_id, current_user)
    sale_item = next((si for si in sale.sale_items if si.id == sale_item_id), None)
    if sale_item is None:
        raise HTTPException(status_code=404, detail="Sale line not found")
    if len(sale.sale_items) <= 1:  # pyright: ignore[reportGeneralTypeIssues]  (D8)
        raise HTTPException(status_code=422, detail="Sale keeps at least one line — void it instead")

    before = _line_snapshot(sale_item)
    item = sale_item.item
    remaining_units = sale_item.quantity
    item.remaining += remaining_units
    db.delete(sale_item)
    db.flush()
    _item_status(db, item)

    # Renumber the remaining lines so the receipt stays tidy — query the DB
    # (post-flush) rather than the possibly-stale in-memory collection.
    rows = (
        db.query(SaleItem)
        .filter(SaleItem.sale_id == sale.id)
        .order_by(SaleItem.line_number.nulls_last(), SaleItem.id)
        .all()
    )
    for number, si in enumerate(rows, start=1):
        si.line_number = number

    _recompute_totals(db, sale, event)
    _audit(
        db, sale, "remove_line", current_user.username,
        before=before, after=None, sale_item_id=sale_item_id,
    )
    db.commit()
    db.refresh(sale)
    return sale


def update_sale(db: Session, event: Event, sale_id: int, current_user: User, payload: SaleUpdate) -> Sale:
    """Correct a completed sale's payment tender and/or customer info fields.

    Recomputes total_paid / balance_due exactly like create; per the create
    contract, a check tender requires a check number. Emits one audit row per
    changed group (``update_payments`` / ``update_info``).
    """
    sale = load_editable_sale(db, event, sale_id, current_user)
    updates = payload.model_dump(exclude_unset=True)
    payment_keys = {"cash_amount", "check_amount", "check_number", "cc_amount", "cc_transaction_id"}
    info_keys = {"customer_name", "customer_email", "notes"}

    payment_changes = {k: v for k, v in updates.items() if k in payment_keys}
    info_changes = {k: v for k, v in updates.items() if k in info_keys}
    if not payment_changes and not info_changes:
        return sale  # no-op PATCH: nothing to audit

    if payment_changes:
        payment_before = _payment_snapshot(sale)
        for key, value in payment_changes.items():
            setattr(sale, key, value)
        new_check = sale.check_amount or 0.0
        if new_check > 0 and not (sale.check_number and str(sale.check_number).strip()):
            db.rollback()
            raise HTTPException(status_code=422, detail="check_number is required when check_amount > 0")
        if "cc_amount" in payment_changes:
            # The card fee is derived from the card terminal charge, which just
            # changed — recompute line-fee totals exactly like checkout.
            _recompute_totals(db, sale, event)
        sale.total_paid = round(
            (sale.cash_amount or 0.0) + (sale.check_amount or 0.0) + (sale.cc_amount or 0.0), 2
        )
        sale.balance_due = round(sale.sale_total - (sale.total_paid or 0.0), 2)
        _audit(
            db, sale, "update_payments", current_user.username,
            before=payment_before, after=_payment_snapshot(sale),
        )
    if info_changes:
        info_before = _info_snapshot(sale)
        for key, value in info_changes.items():
            setattr(sale, key, value)
        _audit(
            db, sale, "update_info", current_user.username,
            before=info_before, after=_info_snapshot(sale),
        )
    db.commit()
    db.refresh(sale)
    return sale