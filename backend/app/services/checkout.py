"""Checkout service for sale creation and commission calculation.

Handles the core transactional logic for the POS checkout flow: validating
item availability, computing per-item commission splits between MYSL and the
seller, and persisting the Sale and SaleItem rows atomically.
"""

from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.schemas.sale import SaleCreate


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
    missing, belongs to a different event, or is not in ``"available"`` status
    the entire operation is rejected before the sale is created.  On success
    the Sale totals (sale_total, mysl_total, seller_total, total_paid,
    balance_due) are computed and all items are marked ``"sold"``.

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
        HTTPException: 422 if any item is not in ``"available"`` status.
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
        if item.is_deleted:
            raise HTTPException(status_code=404, detail=f"Item {item.code} not found")
        if item.quantity <= 0:
            raise HTTPException(
                status_code=422, detail=f"Item {item.code} is sold out"
            )
        if line.quantity > item.quantity:
            raise HTTPException(
                status_code=422,
                detail=f"Item {item.code} has only {int(item.quantity)} remaining",
            )
        items_and_intakes.append((line, item, item.intake))

    # Create sale row
    sale = Sale(
        event_id=event.id,
        date_of_sale=date.today(),
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        notes=payload.notes,
        cash_amount=payload.cash_amount,
        check_amount=payload.check_amount,
        check_number=payload.check_number,
        cc_amount=payload.cc_amount,
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
            extended_price, intake.donate_proceeds, event.commission_rate
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
        # Partial-quantity sale: decrement on-hand; status reflects that a sale
        # has occurred (sellable while quantity > 0, fully sold at 0).
        item.quantity -= line.quantity
        item.status = "sold"
        sale_total += extended_price
        mysl_total += mysl_share
        seller_total += seller_share

    sale.sale_total = round(sale_total, 2)
    sale.mysl_total = round(mysl_total, 2)
    sale.seller_total = round(seller_total, 2)
    sale.total_paid = round(
        payload.cash_amount + payload.check_amount + payload.cc_amount, 2
    )
    sale.balance_due = round(sale.sale_total - sale.total_paid, 2)

    db.commit()
    db.refresh(sale)
    return sale
