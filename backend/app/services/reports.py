"""Report generation service for end-of-event financial and inventory reports.

Provides query functions that aggregate Sale, SaleItem, Item, and Seller data
into structured Pydantic report schemas.  Each public function fetches the
requested event (raising 404 if absent) and returns a fully populated report
object ready to be serialised by the report formatter.
"""

from datetime import date, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.schemas.reports import (
    DonationItem,
    DonationsReport,
    EndOfDayReport,
    EventRevenueReport,
    SellerPayoutLineItem,
    SellerPayoutReport,
    UnsoldItem,
    UnsoldItemsReport,
)


def _now() -> datetime:
    """Return the current UTC datetime."""
    return datetime.now(timezone.utc)


def _get_event_or_404(db: Session, event_id: int) -> Event:
    """Fetch an Event by primary key or raise a 404 HTTPException."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


def get_seller_payout(db: Session, event_id: int, seller_id: int) -> SellerPayoutReport:
    """Build a payout report for a single seller within an event.

    Queries all items consigned by the seller and all non-voided sale items
    to compute gross sales, MYSL commission, and the net amount owed to the
    seller.  Items with ``donate_proceeds`` set contribute their full extended
    price to the MYSL total and zero to the seller total.

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to report on.
        seller_id: Primary key of the seller to report on.

    Returns:
        A populated ``SellerPayoutReport`` schema instance.

    Raises:
        HTTPException: 404 if the event or seller is not found.
    """
    event = _get_event_or_404(db, event_id)
    seller = db.query(Seller).filter(
        Seller.id == seller_id, Seller.event_id == event_id
    ).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found in this event")

    items = (
        db.query(Item)
        .join(Seller)
        .filter(Item.seller_id == seller_id, Seller.event_id == event_id,
                Item.is_deleted.is_(False))
        .all()
    )
    items_sold = sum(1 for it in items if it.status == "sold")
    items_unsold = sum(1 for it in items if it.status in ("available", "returned"))
    items_donated = sum(1 for it in items if it.status == "donated")

    sale_items = (
        db.query(SaleItem)
        .join(Sale)
        .join(Item, SaleItem.item_id == Item.id)
        .options(
            joinedload(SaleItem.item)
            .joinedload(Item.intake)
        )
        .filter(Item.seller_id == seller_id, Sale.is_voided.is_(False))
        .all()
    )

    gross_sales = round(sum(si.extended_price for si in sale_items), 2)
    mysl_total = 0.0
    seller_total_amt = 0.0
    for si in sale_items:
        if si.item.intake.donate_proceeds:
            mysl_total += si.extended_price
        else:
            rate = event.vendor_commission_rate if seller.is_vendor else event.commission_rate
            mysl_share = round(si.extended_price * rate, 2)
            mysl_total += mysl_share
            seller_total_amt += si.extended_price - mysl_share

    # Per-item aggregates for the per-line commission/payout breakdown.
    rate = event.vendor_commission_rate if seller.is_vendor else event.commission_rate
    sold_amount_by_item: dict[int, float] = {}
    sell_price_by_item: dict[int, float] = {}
    donate_proceeds_by_item: dict[int, bool] = {}
    for si in sale_items:
        sold_amount_by_item[si.item_id] = sold_amount_by_item.get(si.item_id, 0.0) + si.extended_price
        sell_price_by_item[si.item_id] = si.sell_price
        donate_proceeds_by_item[si.item_id] = si.item.intake.donate_proceeds

    line_items = []
    for it in items:
        sold_amount = round(sold_amount_by_item.get(it.id, 0.0), 2)
        if sold_amount > 0 and it.id in donate_proceeds_by_item:
            if donate_proceeds_by_item[it.id]:
                mysl_share = sold_amount
                seller_share = 0.0
            else:
                mysl_share = round(sold_amount * rate, 2)
                seller_share = round(sold_amount - mysl_share, 2)
        else:
            mysl_share = 0.0
            seller_share = 0.0
        line_items.append(SellerPayoutLineItem(
            item_code=it.code,
            description=it.description,
            quantity=it.quantity,
            remaining=it.remaining,
            price=it.price,
            sell_price=sell_price_by_item.get(it.id, it.price),
            status=it.status,
            mysl_share=mysl_share,
            seller_share=seller_share,
            commission_rate=rate,
        ))

    return SellerPayoutReport(
        event_id=event_id,
        event_name=event.name,
        seller_id=seller_id,
        seller_code=seller.code,
        seller_name=f"{seller.first_name} {seller.last_name}",
        seller_email=seller.email,
        items_consigned=len(items),
        items_sold=items_sold,
        items_unsold=items_unsold,
        items_donated=items_donated,
        gross_sales=gross_sales,
        mysl_total=round(mysl_total, 2),
        seller_total=round(seller_total_amt, 2),
        line_items=line_items,
        generated_at=_now(),
    )


def get_event_revenue(db: Session, event_id: int) -> EventRevenueReport:
    """Build an aggregate revenue report for an entire event.

    Separates voided from non-voided sales and totals gross revenue, MYSL
    commission, seller payouts, payment-method breakdowns, and the
    donate-proceeds subtotal.

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to report on.

    Returns:
        A populated ``EventRevenueReport`` schema instance.

    Raises:
        HTTPException: 404 if the event is not found.
    """
    event = _get_event_or_404(db, event_id)
    all_sales = (
        db.query(Sale)
        .options(
            joinedload(Sale.sale_items)
            .joinedload(SaleItem.item)
            .joinedload(Item.intake)
        )
        .filter(Sale.event_id == event_id)
        .all()
    )
    non_voided = [s for s in all_sales if not s.is_voided]
    voided = [s for s in all_sales if s.is_voided]

    donate_proceeds_total = 0.0
    for s in non_voided:
        for si in s.sale_items:
            if si.item.intake.donate_proceeds:
                donate_proceeds_total += si.extended_price

    return EventRevenueReport(
        event_id=event_id,
        event_name=event.name,
        event_year=event.year,
        total_sales=len(non_voided),
        voided_sales=len(voided),
        gross_revenue=round(sum(s.sale_total for s in non_voided), 2),
        mysl_total=round(sum(s.mysl_total for s in non_voided), 2),
        seller_total=round(sum(s.seller_total for s in non_voided), 2),
        cash_total=round(sum(s.cash_amount for s in non_voided), 2),
        check_total=round(sum(s.check_amount for s in non_voided), 2),
        cc_total=round(sum(s.cc_amount for s in non_voided), 2),
        donate_proceeds_total=round(donate_proceeds_total, 2),
        generated_at=_now(),
    )


def get_donations(db: Session, event_id: int) -> DonationsReport:
    """Build a report of all donated items for an event.

    Collects two categories of donations:

    * **Proceeds donations** — items sold where the intake had
      ``donate_proceeds=True``.
    * **Unsold donations** — items still in ``"available"`` status whose
      item-level ``donate_unsold`` flag is ``True``.

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to report on.

    Returns:
        A populated ``DonationsReport`` schema instance.

    Raises:
        HTTPException: 404 if the event is not found.
    """
    event = _get_event_or_404(db, event_id)

    proceeds_sale_items = (
        db.query(SaleItem)
        .join(Sale)
        .join(Item, SaleItem.item_id == Item.id)
        .join(Intake, Item.intake_id == Intake.id)
        .join(Seller, Item.seller_id == Seller.id)
        .options(
            joinedload(SaleItem.item)
            .joinedload(Item.seller)
        )
        .filter(
            Sale.event_id == event_id,
            Sale.is_voided.is_(False),
            Intake.donate_proceeds.is_(True),
        )
        .all()
    )
    unsold_donate = (
        db.query(Item)
        .join(Seller)
        .options(joinedload(Item.seller))
        .filter(
            Seller.event_id == event_id,
            Item.remaining > 0,
            Item.donate_unsold.is_(True),
            Item.is_deleted.is_(False),
        )
        .all()
    )

    items = [
        DonationItem(
            seller_code=si.item.seller.code,
            seller_name=f"{si.item.seller.first_name} {si.item.seller.last_name}",
            item_code=si.item.code,
            description=si.item.description,
            quantity=si.item.quantity,
            price=si.sell_price,
            donation_type="proceeds",
        )
        for si in proceeds_sale_items
    ] + [
        DonationItem(
            seller_code=it.seller.code,
            seller_name=f"{it.seller.first_name} {it.seller.last_name}",
            item_code=it.code,
            description=it.description,
            quantity=it.quantity,
            price=it.price,
            donation_type="unsold",
        )
        for it in unsold_donate
    ]

    return DonationsReport(
        event_id=event_id,
        event_name=event.name,
        items=items,
        total_items=len(items),
        total_value=round(sum(i.price for i in items), 2),
        generated_at=_now(),
    )


def get_unsold_items(db: Session, event_id: int) -> UnsoldItemsReport:
    """Build a report of all items still in ``"available"`` status for an event.

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to report on.

    Returns:
        A populated ``UnsoldItemsReport`` schema instance.

    Raises:
        HTTPException: 404 if the event is not found.
    """
    event = _get_event_or_404(db, event_id)
    items = (
        db.query(Item)
        .join(Seller)
        .options(joinedload(Item.seller))
        .filter(Seller.event_id == event_id, Item.remaining > 0,
                Item.is_deleted.is_(False))
        .all()
    )
    unsold = [
        UnsoldItem(
            seller_code=it.seller.code,
            seller_name=f"{it.seller.first_name} {it.seller.last_name}",
            item_code=it.code,
            description=it.description,
            category=it.category,
            quantity=it.quantity,
            remaining=it.remaining,
            price=it.price,
        )
        for it in items
    ]
    return UnsoldItemsReport(
        event_id=event_id,
        event_name=event.name,
        items=unsold,
        total_items=len(unsold),
        total_value=round(sum(i.price for i in unsold), 2),
        generated_at=_now(),
    )


def get_end_of_day(db: Session, event_id: int) -> EndOfDayReport:
    """Build an end-of-day summary report for an event.

    Delegates to ``get_event_revenue`` and re-packages the result into an
    ``EndOfDayReport`` that includes today's date alongside the revenue totals.

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to report on.

    Returns:
        A populated ``EndOfDayReport`` schema instance.

    Raises:
        HTTPException: 404 if the event is not found.
    """
    rev = get_event_revenue(db, event_id)
    return EndOfDayReport(
        event_id=rev.event_id,
        event_name=rev.event_name,
        date_generated=date.today(),
        sales_count=rev.total_sales,
        voided_count=rev.voided_sales,
        gross_revenue=rev.gross_revenue,
        mysl_total=rev.mysl_total,
        seller_total=rev.seller_total,
        cash_total=rev.cash_total,
        check_total=rev.check_total,
        cc_total=rev.cc_total,
        generated_at=rev.generated_at,
    )
