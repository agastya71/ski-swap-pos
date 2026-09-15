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
    TransactionsByUserReport,
    TransactionRow,
    UserSalesSummary,
    SellerPayoutReport,
    SellerPayoutSaleLine,
    SellerPayoutSellerInfo,
    SellerPayoutUnsoldLine,
    SellersPayoutsReport,
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


def _build_seller_payout(db: Session, event: Event, seller: Seller) -> SellerPayoutReport:
    """Compute the payout report for one seller (shared by single + batch)."""
    items = (
        db.query(Item)
        .join(Seller)
        .filter(Item.seller_id == seller.id, Seller.event_id == event.id,
                Item.is_deleted.is_(False))
        .all()
    )
    items_sold = sum(1 for it in items if it.status == "sold")  # pyright: ignore[reportGeneralTypeIssues]
    items_unsold = sum(1 for it in items if it.status in ("available", "returned"))
    items_donated = sum(1 for it in items if it.status == "donated")  # pyright: ignore[reportGeneralTypeIssues]

    sale_items = (
        db.query(SaleItem)
        .join(Sale)
        .join(Item, SaleItem.item_id == Item.id)
        .options(
            joinedload(SaleItem.item)
            .joinedload(Item.intake)
        )
        .filter(Item.seller_id == seller.id, Sale.is_voided.is_(False))
        .all()
    )

    gross_sales = round(sum(si.extended_price for si in sale_items), 2)  # pyright: ignore[reportArgumentType,reportCallIssue]
    mysl_total = 0.0
    seller_total_amt = 0.0

    rate = event.vendor_commission_rate if seller.is_vendor else event.commission_rate  # pyright: ignore[reportGeneralTypeIssues]

    def _shares(extended: float, donate_proceeds: bool) -> tuple[float, float]:
        if donate_proceeds:
            return extended, 0.0
        share = round(extended * rate, 2)  # pyright: ignore[reportArgumentType,reportCallIssue]
        return share, round(extended - share, 2)

    # ── SALES section: one row per non-voided sale line for this seller's items.
    sales: list[SellerPayoutSaleLine] = []
    for si in sale_items:
        mysl_share, seller_share = _shares(si.extended_price, si.item.intake.donate_proceeds)  # pyright: ignore[reportArgumentType]
        if si.item.intake.donate_proceeds:
            mysl_total += si.extended_price
        else:
            mysl_total += mysl_share
            seller_total_amt += seller_share
        sales.append(SellerPayoutSaleLine(
            item_code=si.item.code,
            description=si.item.description,
            date_of_sale=si.sale.date_of_sale,
            quantity_sold=si.quantity,  # pyright: ignore[reportArgumentType]
            sell_price=si.sell_price,  # pyright: ignore[reportArgumentType]
            extended_price=si.extended_price,  # pyright: ignore[reportArgumentType]
            mysl_share=mysl_share,
            seller_share=seller_share,
            commission_rate=rate,  # pyright: ignore[reportArgumentType]
        ))
    sales.sort(key=lambda s: (s.date_of_sale or datetime.min, s.item_code))

    # ── UNSOLD ITEMS section: items still on hand (available / returned / donated).
    unsold_items: list[SellerPayoutUnsoldLine] = []
    for it in items:
        if it.status == "sold":  # pyright: ignore[reportGeneralTypeIssues]
            continue
        unsold_items.append(SellerPayoutUnsoldLine(
            item_code=it.code,  # pyright: ignore[reportArgumentType]
            description=it.description,  # pyright: ignore[reportArgumentType]
            quantity=it.quantity,  # pyright: ignore[reportArgumentType]
            remaining=it.remaining,  # pyright: ignore[reportArgumentType]
            price=it.price,  # pyright: ignore[reportArgumentType]
            status=it.status,  # pyright: ignore[reportArgumentType]
            donate_unsold=it.donate_unsold,  # pyright: ignore[reportArgumentType]
            mysl_share=0.0,
            seller_share=0.0,
            commission_rate=rate,  # pyright: ignore[reportArgumentType]
        ))
    unsold_items.sort(key=lambda u: u.item_code)

    seller_info = SellerPayoutSellerInfo(
        seller_code=seller.code,  # pyright: ignore[reportArgumentType]
        seller_name=f"{seller.first_name} {seller.last_name}".strip(),
        company=seller.company,  # pyright: ignore[reportArgumentType]
        is_vendor=seller.is_vendor,  # pyright: ignore[reportArgumentType]
        email=seller.email,  # pyright: ignore[reportArgumentType]
        phone=seller.phone,  # pyright: ignore[reportArgumentType]
        address=seller.address,  # pyright: ignore[reportArgumentType]
        city=seller.city,  # pyright: ignore[reportArgumentType]
        state=seller.state,  # pyright: ignore[reportArgumentType]
        zip=seller.zip,  # pyright: ignore[reportArgumentType]
        commission_rate=rate,  # pyright: ignore[reportArgumentType]
    )

    return SellerPayoutReport(
        event_id=event.id,  # pyright: ignore[reportArgumentType]
        event_name=event.name,  # pyright: ignore[reportArgumentType]
        seller_id=seller.id,  # pyright: ignore[reportArgumentType]
        seller_code=seller.code,  # pyright: ignore[reportArgumentType]
        seller_name=f"{seller.first_name} {seller.last_name}",
        seller_email=seller.email,  # pyright: ignore[reportArgumentType]
        seller_info=seller_info,
        items_consigned=len(items),
        items_sold=items_sold,
        items_unsold=items_unsold,
        items_donated=items_donated,
        gross_sales=gross_sales,
        mysl_total=round(mysl_total, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        seller_total=round(seller_total_amt, 2),
        sales=sales,
        unsold_items=unsold_items,
        generated_at=_now(),
    )


def get_seller_payout(db: Session, event_id: int, seller_id: int) -> SellerPayoutReport:
    """Build a payout report for a single seller within an event.

    The report carries two detail sections: ``sales`` (every non-voided sale
    line for the seller's items, with prices and commission shares) and
    ``unsold_items`` (every item still on hand, including donated and
    returned items), plus full seller contact information.

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
    return _build_seller_payout(db, event, seller)


def get_all_seller_payouts(db: Session, event_id: int) -> SellersPayoutsReport:
    """Build payout reports for EVERY seller in an event.

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to report on.

    Returns:
        A ``SellersPayoutsReport`` with one per-seller report each plus grand
        totals, sorted by seller code.

    Raises:
        HTTPException: 404 if the event is not found.
    """
    event = _get_event_or_404(db, event_id)
    sellers = (
        db.query(Seller)
        .filter(Seller.event_id == event_id)
        .order_by(Seller.code)
        .all()
    )
    payouts = [_build_seller_payout(db, event, s) for s in sellers]
    return SellersPayoutsReport(
        event_id=event_id,
        event_name=event.name,  # pyright: ignore[reportArgumentType]
        seller_count=len(payouts),
        gross_sales_total=round(sum(p.gross_sales for p in payouts), 2),
        mysl_total=round(sum(p.mysl_total for p in payouts), 2),
        seller_total=round(sum(p.seller_total for p in payouts), 2),
        sellers=payouts,
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
    non_voided = [s for s in all_sales if not s.is_voided]  # pyright: ignore[reportGeneralTypeIssues]
    voided = [s for s in all_sales if s.is_voided]  # pyright: ignore[reportGeneralTypeIssues]

    donate_proceeds_total = 0.0
    for s in non_voided:
        for si in s.sale_items:
            if si.item.intake.donate_proceeds:
                donate_proceeds_total += si.extended_price

    return EventRevenueReport(
        event_id=event_id,
        event_name=event.name,  # pyright: ignore[reportArgumentType]
        event_year=event.year,  # pyright: ignore[reportArgumentType]
        total_sales=len(non_voided),
        voided_sales=len(voided),
        gross_revenue=round(sum(s.sale_total for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        mysl_total=round(sum(s.mysl_total for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        seller_total=round(sum(s.seller_total for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        cash_total=round(sum(s.cash_amount for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        check_total=round(sum(s.check_amount for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        cc_total=round(sum(s.cc_amount for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
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
            remaining=si.item.remaining,
            price=si.sell_price,  # pyright: ignore[reportArgumentType]
            donation_type="proceeds",
        )
        for si in proceeds_sale_items
    ] + [
        DonationItem(
            seller_code=it.seller.code,
            seller_name=f"{it.seller.first_name} {it.seller.last_name}",
            item_code=it.code,  # pyright: ignore[reportArgumentType]
            description=it.description,  # pyright: ignore[reportArgumentType]
            quantity=it.quantity,  # pyright: ignore[reportArgumentType]
            remaining=it.remaining,  # pyright: ignore[reportArgumentType]
            price=it.price,  # pyright: ignore[reportArgumentType]
            donation_type="unsold",
        )
        for it in unsold_donate
    ]

    return DonationsReport(
        event_id=event_id,
        event_name=event.name,  # pyright: ignore[reportArgumentType]
        items=items,
        total_items=len(items),
        total_value=round(sum(i.price for i in items), 2),
        generated_at=_now(),
    )


def get_unsold_items(db: Session, event_id: int) -> UnsoldItemsReport:
    """Build a report of all on-hand items (remaining > 0, not deleted) for an event.

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
            item_code=it.code,  # pyright: ignore[reportArgumentType]
            description=it.description,  # pyright: ignore[reportArgumentType]
            category=it.category,  # pyright: ignore[reportArgumentType]
            quantity=it.quantity,  # pyright: ignore[reportArgumentType]
            remaining=it.remaining,  # pyright: ignore[reportArgumentType]
            price=it.price,  # pyright: ignore[reportArgumentType]
            donate_unsold=it.donate_unsold,  # pyright: ignore[reportArgumentType]
        )
        for it in items
    ]
    return UnsoldItemsReport(
        event_id=event_id,
        event_name=event.name,  # pyright: ignore[reportArgumentType]
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


def get_transactions_by_user(db: Session, event_id: int) -> TransactionsByUserReport:
    """Build a report listing every event transaction grouped by cashier.

    Transactions are the event's Sales, grouped by ``Sale.created_by`` (the
    login of the user who recorded them). Non-voided sales feed the revenue
    aggregates; voided sales are listed (flagged) and counted separately.
    Users are sorted by cashier name; each user's transactions are newest
    first. Transactions with ``created_by`` unset (legacy rows) are grouped
    under "(unknown)".

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to report on.

    Returns:
        A populated ``TransactionsByUserReport`` schema instance.

    Raises:
        HTTPException: 404 if the event is not found.
    """
    event = _get_event_or_404(db, event_id)
    sales = (
        db.query(Sale)
        .filter(Sale.event_id == event_id)
        .options(joinedload(Sale.sale_items))
        .all()
    )

    grouped: dict[str, list[TransactionRow]] = {}
    for sale in sales:
        cashier = sale.created_by if sale.created_by else "(unknown)"  # pyright: ignore[reportGeneralTypeIssues]
        # int() would raise on a NaN/inf sum; quantities are always finite, so
        # the fallback is defensive only.
        try:
            units_sold = int(sum(si.quantity for si in sale.sale_items))
        except (TypeError, ValueError, OverflowError):
            units_sold = 0
        grouped.setdefault(cashier, []).append(TransactionRow(  # pyright: ignore[reportArgumentType]
            sale_id=sale.id,  # pyright: ignore[reportArgumentType]
            cashier=cashier,  # pyright: ignore[reportArgumentType]
            date_of_sale=sale.date_of_sale,  # pyright: ignore[reportArgumentType]
            items_count=len(sale.sale_items),
            units_sold=units_sold,
            sale_total=round(sale.sale_total, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
            mysl_total=round(sale.mysl_total, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
            seller_total=round(sale.seller_total, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
            cash_amount=round(sale.cash_amount, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
            check_amount=round(sale.check_amount, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
            cc_amount=round(sale.cc_amount, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
            is_voided=sale.is_voided,  # pyright: ignore[reportArgumentType]
        ))

    users: list[UserSalesSummary] = []
    for cashier, rows in grouped.items():
        live = [t for t in rows if not t.is_voided]
        voided = [t for t in rows if t.is_voided]
        rows.sort(key=lambda t: (t.date_of_sale or datetime.min, t.sale_id), reverse=True)
        users.append(UserSalesSummary(
            cashier=cashier,
            transactions=rows,
            sales_count=len(live),
            voided_count=len(voided),
            gross_sales=round(sum(t.sale_total for t in live), 2),
            mysl_total=round(sum(t.mysl_total for t in live), 2),
            seller_total=round(sum(t.seller_total for t in live), 2),
            cash_total=round(sum(t.cash_amount for t in live), 2),
            check_total=round(sum(t.check_amount for t in live), 2),
            cc_total=round(sum(t.cc_amount for t in live), 2),
        ))
    users.sort(key=lambda u: u.cashier.lower())

    return TransactionsByUserReport(
        event_id=event_id,
        event_name=event.name,  # pyright: ignore[reportArgumentType]
        users=users,
        total_sales=sum(u.sales_count for u in users),
        total_voided=sum(u.voided_count for u in users),
        gross_sales=round(sum(u.gross_sales for u in users), 2),
        mysl_total=round(sum(u.mysl_total for u in users), 2),
        seller_total=round(sum(u.seller_total for u in users), 2),
        generated_at=datetime.now(timezone.utc),
    )
