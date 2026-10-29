"""Checkout service for sale creation and commission calculation.

Handles the core transactional logic for the POS checkout flow: validating
item availability, computing per-item commission splits between MYSL and the
seller, and persisting the Sale and SaleItem rows atomically.
"""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.schemas.sale import SaleCreate

# 3% buyer-paid card transaction fee (2026-10-28). The buyer's card charge
# INCLUDES the fee: the terminal runs for items×1.03 (rounded on the fee), so
# the fee is derived from the recorded card charge — fee = charge × 3/103 —
# which keeps sale_total and the tendered breakdown exactly reconciled.
# Retained by MYSL to cover the processor's transaction costs; seller payout
# shares are computed on line prices only and never inflated by the fee.
CC_FEE_RATE = 0.03


def compute_card_fee(cc_amount: float) -> float:
    """Derive the buyer-paid card fee from the recorded card terminal charge.

    ``cc_amount`` is the amount actually run on the card, which covers both
    the card-financed item subtotal and this fee: an all-card sale of $100.00
    of items is charged $103.00 on the terminal, and this returns $3.00.
    Returns 0.0 for a non-positive charge (no card tender / re-tender edits).
    """
    if cc_amount <= 0:
        return 0.0
    return round(cc_amount * CC_FEE_RATE / (1 + CC_FEE_RATE), 2)


def compute_commission(
    item_price: float, donate_proceeds: bool, commission_rate: float
) -> tuple[float, float]:
    """Compute the MYSL and seller revenue split for a single line item.

    When ``donate_proceeds`` is True the entire extended price goes to MYSL
    and the seller receives nothing.  Otherwise the split is determined by
    ``commission_rate``.

    Args:
        item_price: Extended price of the line item (sell_price × quantity),
            already rounded to 2 decimal places by the caller.
        donate_proceeds: If True, all revenue is directed to MYSL.
        commission_rate: Fraction of item price that MYSL retains (e.g.
            ``0.30`` for 30 %).

    Returns:
        A two-tuple ``(mysl_share, seller_share)`` where both values are
        rounded to 2 decimal places and their sum equals ``item_price``.
    """
    if donate_proceeds:
        return round(item_price, 2), 0.0
    mysl = round(item_price * commission_rate, 2)
    return mysl, round(item_price - mysl, 2)


def create_sale_atomic(
    db: Session, payload: SaleCreate, event: Event, username: str
) -> Sale:
    """Create a sale with all line items in a single atomic database transaction.

    Validates every requested item before any row is written.  If any item is
    missing, deleted, or has insufficient remaining quantity the entire
    operation is rejected before the sale is created.  On success
    the Sale totals (sale_total, mysl_total, seller_total, total_paid,
    balance_due) are computed, item.remaining is decremented by each sold
    quantity, and all items are marked ``"sold"``.

    Args:
        db: Active SQLAlchemy database session.
        payload: Validated sale request schema including line items and
            payment breakdown.
        event: The active Event ORM instance used to scope item lookups and
            apply the commission rate.
        username: Login name of the cashier creating the sale, recorded on
            the Sale and SaleItem rows.

    Returns:
        The newly created and refreshed Sale ORM instance with all
        relationships populated.

    Raises:
        HTTPException: 422 if the request contains duplicate item IDs.
        HTTPException: 404 if any item ID is not found within the event.
        HTTPException: 422 if any line exceeds the item's remaining quantity.
    """
    # Dedup check
    item_ids = [line.item_id for line in payload.items]
    if len(item_ids) != len(set(item_ids)):
        raise HTTPException(status_code=422, detail="Duplicate item_id in request")

    # Validate all items upfront before any mutations
    items_and_intakes: list[tuple] = []
    for line in payload.items:
        item = (
            db.query(Item)
            .join(Intake)
            .join(Seller)
            .filter(Item.id == line.item_id, Seller.event_id == event.id)
            .first()
        )
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")
        if item.is_deleted:  # pyright: ignore[reportGeneralTypeIssues]
            raise HTTPException(status_code=404, detail=f"Item {item.code} not found")
        if item.remaining <= 0:  # pyright: ignore[reportGeneralTypeIssues]
            raise HTTPException(
                status_code=422, detail=f"Item {item.code} is sold out"
            )
        if line.quantity > item.remaining:  # pyright: ignore[reportGeneralTypeIssues]
            raise HTTPException(
                status_code=422,
                detail=f"Item {item.code} has only {getattr(item, 'remaining')} remaining",
            )
        items_and_intakes.append((line, item, item.intake))

    # Create sale row
    sale = Sale(
        event_id=event.id,
        date_of_sale=datetime.now(timezone.utc),
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        notes=payload.notes,
        cash_amount=payload.cash_amount,
        check_amount=payload.check_amount,
        check_number=payload.check_number,
        cc_amount=payload.cc_amount,
        cc_transaction_id=payload.cc_transaction_id,
        created_by=username,
    )
    db.add(sale)
    db.flush()  # get sale.id without committing

    # Create sale_item rows, mark items sold, accumulate totals
    sale_total = 0.0
    mysl_total = 0.0
    seller_total = 0.0

    for line_number, (line, item, intake) in enumerate(items_and_intakes, start=1):
        sell_price = line.sell_price if line.sell_price is not None else item.price
        extended_price = round(sell_price * line.quantity, 2)
        mysl_share, seller_share = compute_commission(
            extended_price, intake.donate_proceeds, event.commission_rate  # pyright: ignore[reportArgumentType]
        )
        db.add(SaleItem(
            sale_id=sale.id,
            item_id=item.id,
            line_number=line_number,
            quantity=line.quantity,
            sell_price=sell_price,
            extended_price=extended_price,
            notes=line.notes,
            created_by=username,
        ))
        # Partial-quantity sale: decrement the on-hand remaining units. The
        # intake `quantity` is never mutated, so the original units entered at
        # intake stay accurate. Status marks that a sale has occurred (sellable
        # while remaining > 0, fully sold at 0).
        item.remaining -= line.quantity
        item.status = "sold"
        sale_total += extended_price
        mysl_total += mysl_share
        seller_total += seller_share

    # Totals: the card fee (when the buyer charged any amount to a card) is
    # an explicit buyer-paid charge on top of the line totals; it is part of
    # sale_total and is retained by MYSL (added to mysl_total), while
    # seller_total stays the pure commission split of the line prices.
    cc_fee = compute_card_fee(payload.cc_amount)

    sale.sale_total = round(sale_total + cc_fee, 2)  # pyright: ignore[reportAttributeAccessIssue]
    sale.mysl_total = round(mysl_total + cc_fee, 2)  # pyright: ignore[reportAttributeAccessIssue]
    sale.seller_total = round(seller_total, 2)  # pyright: ignore[reportAttributeAccessIssue]
    sale.cc_fee = cc_fee  # pyright: ignore[reportAttributeAccessIssue]
    sale.total_paid = round(  # pyright: ignore[reportCallIssue,reportArgumentType,reportAttributeAccessIssue]
        payload.cash_amount + payload.check_amount + payload.cc_amount, 2
    )
    sale.balance_due = round(sale.sale_total - sale.total_paid, 2)  # pyright: ignore[reportCallIssue,reportArgumentType,reportAttributeAccessIssue]

    db.commit()
    db.refresh(sale)
    return sale
