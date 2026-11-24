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

# 3% buyer-paid card transaction fee (2026-10-28) was REMOVED 2026-11-24
# (event feedback #7): checkout no longer computes a card fee. New sales
# carry cc_fee 0.0 (the column stays for historical rows, whose stamped
# fee rides inside mysl_total and is preserved by reports).
CC_FEE_RATE = 0.03


def compute_card_fee(cc_amount: float) -> float:
    """Legacy fee decoder — kept only so sale-edit recompute paths can leave
    historical stamped fees untouched; new checkout math no longer calls it.

    Returns the buyer-paid fee derived from the recorded card terminal
    charge (charge × 3/103), or 0.0 for a non-positive charge. Unused by
    create_sale_atomic as of the fee removal; scheduled for deletion once
    no caller needs it.
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

    Deprecated for event-scoped splits: prefer ``_split_line`` in
    ``app.services.reports`` / ``_sale_line_split`` here, which also honor
    the event's commission-exempt seller codes (e.g. MYSL2 keeps 100% of its
    own sales). Kept for backwards compatibility with existing callers/tests.

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


def _sale_line_split(
    extended: float,
    donate_proceeds: bool,
    rate: float,
    exempt: bool,
) -> tuple[float, float]:
    """Split one sale line into (mysl_share, seller_share), honoring exemptions.

    Mirrors ``app.services.reports._split_line`` (kept separate to avoid a
    circular router/service import):

    1. ``donate_proceeds`` — full price to MYSL.
    2. ``exempt`` — full price to the seller, 0 commission (event-level
       exempt-seller rule, e.g. MYSL2's own stall).
    3. Otherwise — ``rate`` commission to MYSL, rounded remainder to seller.
    """
    if donate_proceeds:
        return round(extended, 2), 0.0
    if exempt:
        return 0.0, round(extended, 2)
    mysl = round(extended * rate, 2)
    return mysl, round(extended - mysl, 2)


def _exempt_codes_for_event(event: Event) -> frozenset[str]:
    """Uppercased lookup set of the event's commission-exempt seller codes."""
    raw = getattr(event, "exempt_seller_codes", None)
    if not raw:
        return frozenset()
    return frozenset(
        part.strip().upper() for part in str(raw).split(",") if part.strip()
    )


def next_transaction_number(db: Session, event: Event) -> int:
    """Next per-event transaction display number (issue #12).

    MAX + 1 within the event, under the unique (event_id,
    transaction_number) index. Cancelled/voided sales keep their number —
    the sequence only ever advances, so IDs are never reused. Called inside
    the reservation/finalize DB transaction; a IntegrityError from a
    concurrent reservation rejects the request and the client retries.
    """
    highest = (
        db.query(Sale.transaction_number)  # pyright: ignore[reportAttributeAccessIssue]
        .filter(Sale.event_id == event.id)  # pyright: ignore[reportGeneralTypeIssues]
        .order_by(Sale.transaction_number.desc())  # pyright: ignore[reportAttributeAccessIssue]
        .first()
    )
    return (highest[0] if highest else 0) + 1


def reserve_transaction(db: Session, event: Event, username: str) -> Sale:
    """Start a transaction: stamp the next display ID immediately (issue #12).

    Creates a placeholder sale row (is_finalized=False, no items) purely to
    pin the display number from the moment the sale starts; the actual
    checkout adopts the row and finalizes it. If the cashier abandons the
    transaction (leaves the POS screen without buying), the reservation must
    be cancelled — POST /sales/{id}/void on the reservation — which voids it
    and permanently retires the number (never reused).
    """
    sale = Sale(
        event_id=event.id,
        date_of_sale=datetime.now(timezone.utc),
        transaction_number=next_transaction_number(db, event),
        is_voided=False,
        is_finalized=False,
        created_by=username,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)
    return sale


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

    # Create sale row. transaction_number comes from an adopted reservation
    # (payload.transaction_id) when the POS started the transaction first —
    # the display ID was already stamped at that point and must not change;
    # otherwise the next number is allocated here (walk-up single-step flow).
    adopted: Sale | None = None
    if payload.transaction_id is not None:
        adopted = (
            db.query(Sale)
            .filter(
                Sale.id == payload.transaction_id,  # pyright: ignore[reportGeneralTypeIssues]
                Sale.event_id == event.id,  # pyright: ignore[reportGeneralTypeIssues]
                Sale.is_finalized == False,  # noqa: E712 — draft reservation only
                Sale.is_voided == False,  # noqa: E712
            )
            .with_for_update()
            .first()
        )
        if not adopted:
            raise HTTPException(
                status_code=409,
                detail="Reserved transaction not found, already completed, or cancelled",
            )

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
    if adopted is not None:
        # Issue #12: the checkout adopts the reservation row created when the
        # sale STARTED, so the display number (and row id) the cashier has
        # been quoting all along stays. All checkout data is copied onto it.
        # (pyright ignores: Column-attribute assignment idiom, same class as
        # the file's pre-existing baseline — see 2026-11-24 disposition.)
        adopted.date_of_sale = datetime.now(timezone.utc)  # pyright: ignore[reportAttributeAccessIssue]
        adopted.customer_name = payload.customer_name  # pyright: ignore[reportAttributeAccessIssue]
        adopted.customer_email = payload.customer_email  # pyright: ignore[reportAttributeAccessIssue]
        adopted.notes = payload.notes  # pyright: ignore[reportAttributeAccessIssue]
        adopted.cash_amount = payload.cash_amount  # pyright: ignore[reportAttributeAccessIssue]
        adopted.check_amount = payload.check_amount  # pyright: ignore[reportAttributeAccessIssue]
        adopted.check_number = payload.check_number  # pyright: ignore[reportAttributeAccessIssue]
        adopted.cc_amount = payload.cc_amount  # pyright: ignore[reportAttributeAccessIssue]
        adopted.cc_transaction_id = payload.cc_transaction_id  # pyright: ignore[reportAttributeAccessIssue]
        adopted.created_by = username  # pyright: ignore[reportAttributeAccessIssue]
        adopted.is_finalized = True  # pyright: ignore[reportAttributeAccessIssue]  # pyright: ignore[reportAttributeAccessIssue]
        sale = adopted
    else:
        sale.transaction_number = next_transaction_number(  # pyright: ignore[reportAttributeAccessIssue]
            db, event
        )
        sale.is_finalized = True  # pyright: ignore[reportAttributeAccessIssue]
    db.add(sale)
    db.flush()  # get sale.id without committing

    # Create sale_item rows, mark items sold, accumulate totals
    sale_total = 0.0
    mysl_total = 0.0
    seller_total = 0.0
    exempt_codes = _exempt_codes_for_event(event)

    for line_number, (line, item, intake) in enumerate(items_and_intakes, start=1):
        sell_price = line.sell_price if line.sell_price is not None else item.price
        extended_price = round(sell_price * line.quantity, 2)
        rate = (
            bool(getattr(item.seller, "is_vendor", False)) and event.vendor_commission_rate
        ) or event.commission_rate  # pyright: ignore[reportGeneralTypeIssues]
        exempt = (
            str(getattr(item.seller, "code", "") or "").strip().upper() in exempt_codes
        )
        mysl_share, seller_share = _sale_line_split(
            extended_price, intake.donate_proceeds, rate, exempt  # pyright: ignore[reportArgumentType]
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

    # Totals. The buyer-paid 3% card fee (2026-10-28) was removed 2026-11-24
    # (event feedback #7): sale_total is now the pure line sum, cc_fee stamps
    # 0.0. Historical sale rows keep their stamped fee (part of mysl_total)
    # and reports.py still adds stamped cc_fee back into mysl_line_total for
    # them, so old-data revenue identities are preserved.
    cc_fee = 0.0

    sale.sale_total = round(sale_total, 2)  # pyright: ignore[reportAttributeAccessIssue]
    sale.mysl_total = round(mysl_total, 2)  # pyright: ignore[reportAttributeAccessIssue]
    sale.seller_total = round(seller_total, 2)  # pyright: ignore[reportAttributeAccessIssue]
    sale.cc_fee = cc_fee  # pyright: ignore[reportAttributeAccessIssue]
    sale.total_paid = round(  # pyright: ignore[reportCallIssue,reportArgumentType,reportAttributeAccessIssue]
        payload.cash_amount + payload.check_amount + payload.cc_amount, 2
    )
    sale.balance_due = round(sale.sale_total - sale.total_paid, 2)  # pyright: ignore[reportCallIssue,reportArgumentType,reportAttributeAccessIssue]

    db.commit()
    db.refresh(sale)
    return sale
