"""Report generation service for end-of-event financial and inventory reports.

Provides query functions that aggregate Sale, SaleItem, Item, and Seller data
into structured Pydantic report schemas.  Each public function fetches the
requested event (raising 404 if absent) and returns a fully populated report
object ready to be serialised by the report formatter.
"""

from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.schemas.reports import (
    CheckTransactionRow,
    CheckTransactionsReport,
    DonationItem,
    DonationsReport,
    EndOfDayReport,
    EventRevenueReport,
    NonVendorSalesBlock,
    NonVendorSalesWorkbook,
    TransactionsByUserReport,
    TransactionRow,
    UserSalesSummary,
    SellerPayoutItemLine,
    SellerPayoutReport,
    SellerPayoutSaleLine,
    SellerPayoutSellerInfo,
    SellersPayoutsReport,
    UnsoldItem,
    UnsoldItemsReport,
    VendorCategoryLine,
    VendorEquipmentSummaryReport,
    VendorSalesBlock,
    VendorSalesItemRow,
    VendorSalesWorkbook,
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


def _exempt_seller_codes(event: Event) -> frozenset[str]:
    """Parse the event's exempt-seller list into an UPPERCASED lookup set.

    ``Event.exempt_seller_codes`` is a comma-separated string of seller codes
    (e.g. ``'MYSL2'``) whose sale proceeds bypass commission entirely: the
    seller receives the full extended price and the MYSL share is 0. Codes
    are compared case-insensitively; blank/None means no exemptions.
    """
    raw = getattr(event, "exempt_seller_codes", None)
    if not raw:
        return frozenset()
    return frozenset(
        part.strip().upper() for part in str(raw).split(",") if part.strip()
    )


def _seller_is_exempt(seller: Seller, exempt_codes: frozenset[str]) -> bool:
    """True when this seller's code matches the event's exempt list (case-insensitive)."""
    if not exempt_codes:
        return False
    return str(getattr(seller, "code", "") or "").strip().upper() in exempt_codes


def _num(value: Any) -> float:
    """Coerce an ORM attribute (a ``Column`` type under pyright, numeric at
    runtime) to float, so aggregate arithmetic stays type-clean without
    scattering per-line ignores across multi-line generators."""
    return float(value)  # pyright: ignore[reportArgumentType,reportCallIssue]


def _split_line(
    extended: float, donate_proceeds: bool, rate: float, exempt: bool
) -> tuple[float, float]:
    """Split one sale line's extended price into (mysl_share, seller_share).

    Rule order:
    1. ``donate_proceeds`` (seller donated their proceeds) — full price to MYSL.
    2. ``exempt`` (event-level commission exemption, e.g. MYSL's own vendor
       stall) — full price to the seller, 0 commission.
    3. Otherwise — ``rate`` commission to MYSL, the remainder to the seller,
       with the residual rounded so shares add back to the extended price.
    """
    if donate_proceeds:
        return extended, 0.0
    if exempt:
        return 0.0, round(extended, 2)
    share = round(extended * rate, 2)  # pyright: ignore[reportArgumentType,reportCallIssue]
    return share, round(extended - share, 2)


def _build_seller_payout(db: Session, event: Event, seller: Seller) -> SellerPayoutReport:
    """Compute the payout report for one seller (shared by single + batch)."""
    # ── Summary counters, unit-based (task 2026-11-23): an item's quantity
    # counts as multiple units. Consigned = sold + on-hand + donated holds:
    # sold takes (quantity − remaining) of "sold" items; on-hand and donated
    # both take remaining, partitioned by status.
    items = (
        db.query(Item)
        .join(Seller)
        .filter(Item.seller_id == seller.id, Seller.event_id == event.id,
                Item.is_deleted.is_(False))
        .all()
    )
    items_consigned = int(round(sum(_num(it.quantity) for it in items)))
    items_sold = int(round(sum(
        _num(it.quantity) - _num(it.remaining)
        for it in items
        if str(it.status) == "sold"
    )))
    items_unsold = int(round(sum(
        _num(it.remaining)
        for it in items
        if str(it.status) != "donated"
    )))
    items_donated = int(round(sum(
        _num(it.remaining)
        for it in items
        if str(it.status) == "donated"
    )))

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
    exempt = _seller_is_exempt(seller, _exempt_seller_codes(event))

    # ── SALES section: one row per non-voided sale line for this seller's items.
    sales: list[SellerPayoutSaleLine] = []
    for si in sale_items:
        mysl_share, seller_share = _split_line(
            si.extended_price,  # pyright: ignore[reportArgumentType]
            si.item.intake.donate_proceeds,  # pyright: ignore[reportArgumentType]
            rate,  # pyright: ignore[reportArgumentType]
            exempt,
        )
        if si.item.intake.donate_proceeds:
            mysl_total += si.extended_price
        else:
            mysl_total += mysl_share
            seller_total_amt += seller_share
        sales.append(SellerPayoutSaleLine(
            item_code=si.item.code,
            description=si.item.description,
            category=si.item.category,  # pyright: ignore[reportArgumentType]
            type=si.item.type,  # pyright: ignore[reportArgumentType]
            brand=si.item.brand,  # pyright: ignore[reportArgumentType]
            date_of_sale=si.sale.date_of_sale,
            quantity_sold=si.quantity,  # pyright: ignore[reportArgumentType]
            sell_price=si.sell_price,  # pyright: ignore[reportArgumentType]
            extended_price=si.extended_price,  # pyright: ignore[reportArgumentType]
            price_adjustment_reason=si.notes,  # pyright: ignore[reportArgumentType]
            mysl_share=mysl_share,
            seller_share=seller_share,
            commission_rate=rate,  # pyright: ignore[reportArgumentType]
        ))
    sales.sort(key=lambda s: (s.date_of_sale or datetime.min, s.item_code))

    # ── ITEMS section (single list, worksheet layout + Item Code): EVERY
    # consigned item — sold and unsold — with original/remaining quantity
    # columns, sorted by item code. Replaces the old SALES/UNSOLD split's
    # "Unsold Items" table (sold rows now show remaining 0).
    item_list: list[SellerPayoutItemLine] = []
    for it in items:
        item_list.append(SellerPayoutItemLine(
            item_code=it.code,  # pyright: ignore[reportArgumentType]
            category=it.category,  # pyright: ignore[reportArgumentType]
            brand=it.brand,  # pyright: ignore[reportArgumentType]
            description=it.description,  # pyright: ignore[reportArgumentType]
            size=it.size,  # pyright: ignore[reportArgumentType]
            price=it.price,  # pyright: ignore[reportArgumentType]
            quantity=it.quantity,  # pyright: ignore[reportArgumentType]
            remaining=it.remaining,  # pyright: ignore[reportArgumentType]
        ))
    item_list.sort(key=lambda i: i.item_code)

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
        items_consigned=items_consigned,
        items_sold=items_sold,
        items_unsold=items_unsold,
        items_donated=items_donated,
        gross_sales=gross_sales,
        mysl_total=round(mysl_total, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        seller_total=round(seller_total_amt, 2),
        items=item_list,
        sales=sales,
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


def get_vendor_equipment_summary(
    db: Session, event_id: int, seller_id: int
) -> VendorEquipmentSummaryReport:
    """Summarise a VENDOR's sales grouped by equipment type (item.category).

    Built for vendors who want, e.g., "how many skate skis did I sell": one
    row per item category with units sold, gross revenue, MYSL/vendor shares
    (vendor commission rate; donate-proceeds lines send everything to MYSL),
    plus on-hand (unsold) units and their asking-price value. Admin generates
    it on demand; vendors have no logins.

    Args:
        db: Active SQLAlchemy database session.
        event_id: Primary key of the event to report on.
        seller_id: Primary key of the vendor seller to report on.

    Returns:
        A populated ``VendorEquipmentSummaryReport`` with one row per
        category (sorted by name) and a ``TOTAL`` grand-total row.

    Raises:
        HTTPException: 404 if the event or seller is not found.
        HTTPException: 422 if the seller is not a vendor.
    """
    event = _get_event_or_404(db, event_id)
    seller = db.query(Seller).filter(
        Seller.id == seller_id, Seller.event_id == event.id
    ).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found in this event")
    if not seller.is_vendor:  # pyright: ignore[reportGeneralTypeIssues]
        raise HTTPException(status_code=422, detail="Seller is not a vendor")

    # getattr() keeps pyright clean on ORM Column attributes (the
    # established idiom in this codebase).
    rate = getattr(event, "vendor_commission_rate", 0.30) or 0.30
    exempt = _seller_is_exempt(seller, _exempt_seller_codes(event))

    items = (
        db.query(Item)
        .join(Seller)
        .filter(Item.seller_id == seller.id, Seller.event_id == event.id,
                Item.is_deleted.is_(False))
        .all()
    )
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

    def _display(category) -> str:
        """Category label for grouping; '(uncategorized)' when blank."""
        text = str(category) if category is not None else ""
        return text if text.strip() else "(uncategorized)"

    agg: dict[str, dict] = {}

    def _bucket(category) -> dict:
        return agg.setdefault(_display(category), {
            "items": 0, "units_sold": 0.0, "gross": 0.0,
            "mysl": 0.0, "seller": 0.0, "units_unsold": 0.0, "unsold_value": 0.0,
        })

    for it in items:
        b = _bucket(getattr(it, "category", None))
        remaining = getattr(it, "remaining", 0.0) or 0.0
        price = getattr(it, "price", 0.0) or 0.0
        b["items"] += 1
        b["units_unsold"] += remaining
        b["unsold_value"] += price * remaining
    for si in sale_items:
        b = _bucket(getattr(si.item, "category", None))
        extended = getattr(si, "extended_price", 0.0) or 0.0
        b["units_sold"] += getattr(si, "quantity", 0.0) or 0.0
        b["gross"] += extended
        donate = bool(getattr(si.item.intake, "donate_proceeds", False)) if si.item.intake is not None else False
        if donate:
            b["mysl"] += extended
        else:
            # Exemption (e.g. MYSL2) sends the vendor the full extended price.
            # NB: unpack as mysl_share/seller_share — a `seller` local would
            # shadow the Seller ORM instance used below for report metadata.
            mysl_share, seller_share = _split_line(extended, donate, rate, exempt)
            b["mysl"] += mysl_share
            b["seller"] += seller_share

    def _line(category: str, v: dict) -> VendorCategoryLine:
        return VendorCategoryLine(
            category=category,
            items_consigned=v["items"],
            units_sold=round(v["units_sold"], 2),
            gross_sales=round(v["gross"], 2),
            mysl_share=round(v["mysl"], 2),
            seller_share=round(v["seller"], 2),
            units_unsold=round(v["units_unsold"], 2),
            unsold_value=round(v["unsold_value"], 2),
        )

    lines = [_line(cat, v) for cat, v in sorted(agg.items())]
    total = _line("TOTAL", {
        "items": sum(l.items_consigned for l in lines),
        "units_sold": sum(l.units_sold for l in lines),
        "gross": sum(l.gross_sales for l in lines),
        "mysl": sum(l.mysl_share for l in lines),
        "seller": sum(l.seller_share for l in lines),
        "units_unsold": sum(l.units_unsold for l in lines),
        "unsold_value": sum(l.unsold_value for l in lines),
    })
    company = getattr(seller, "company", None)
    name = str(company) if company else f"{getattr(seller, 'first_name', '')} {getattr(seller, 'last_name', '')}".strip()
    return VendorEquipmentSummaryReport(
        event_id=getattr(event, "id", 0),  # pyright: ignore[reportArgumentType]
        event_name=str(getattr(event, "name", "")),
        seller_code=str(getattr(seller, "code", "")),
        seller_name=name,
        company=str(company) if company is not None else None,
        vendor_commission_rate=rate,
        categories=lines,
        total=total,
        generated_at=_now(),
    )


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


def get_vendor_sales_report(db: Session, event_id: int) -> VendorSalesWorkbook:
    """Build the consolidated vendor-sales report for an event.

    One block per vendor seller, mirroring the legacy 'Retailer_Sales'
    workbook the league has historically sent to its vendors: per-item rows
    (Qty In / Price / Extend / Qty Sold / Sell Price / Sell Extend / Due
    Seller / Unsold / Donate), a Totals row per vendor, and a blank
    separator row rendered by the xlsx formatter between blocks.

    Value rules (confirmed by the league for 2026):
    - Extend = Qty In × Price (full consigned value).
    - Qty Sold = sum of sale-line quantities over NON-VOIDED sales.
    - Sell Extend = sum of those lines' extended prices; Sell Price =
      Sell Extend ÷ Qty Sold (average achieved price, matches the legacy
      sheet's repriced-merch behaviour; 0 when nothing sold).
    - Due Seller = per-line share under donate-proceeds > exemption >
      vendor-commission-rate rules (same splitter as checkout/payouts).
    - Unsold = (remaining units NOT marked donate-unsold) × list price.
    - Donate = (remaining units marked donate-unsold) × list price.

    Shares one block builder with :func:`get_nonvendor_sales_report`; the
    two workbooks differ only in seller population (``is_vendor`` flag)
    and the commission rate applied to Due Seller.
    """
    workbook = _build_sales_workbook(
        db, event_id, vendor_only=True,
        rate=getattr(_get_event_or_404(db, event_id), "vendor_commission_rate", 0.15) or 0.15,
    )
    return VendorSalesWorkbook(
        event_id=workbook.event_id,
        event_name=workbook.event_name,
        commission_rate=workbook.commission_rate,
        vendors=[VendorSalesBlock.model_validate(b.model_dump()) for b in workbook.vendors],
        generated_at=workbook.generated_at,
    )


def get_nonvendor_sales_report(db: Session, event_id: int) -> NonVendorSalesWorkbook:
    """Build the consolidated non-vendor (individual-seller) sales report.

    Mirrors the vendor workbook exactly — same 16-column rows, a Totals row
    per seller, blank separator row, exempt sellers LAST — but covers every
    individual (non-vendor) consignor and computes Due Seller at the event's
    INDIVIDUAL commission rate. Rendered to xlsx as sheet 'NonVendor_Sales'
    by the report formatter.
    """
    workbook = _build_sales_workbook(
        db, event_id, vendor_only=False,
        rate=getattr(_get_event_or_404(db, event_id), "commission_rate", 0.30) or 0.30,
    )
    return NonVendorSalesWorkbook(
        event_id=workbook.event_id,
        event_name=workbook.event_name,
        commission_rate=workbook.commission_rate,
        vendors=[NonVendorSalesBlock.model_validate(b.model_dump()) for b in workbook.vendors],
        generated_at=workbook.generated_at,
    )


def _build_sales_workbook(
    db: Session, event_id: int, *, vendor_only: bool, rate: float
) -> VendorSalesWorkbook:
    """Shared block builder for the vendor / non-vendor sales workbooks.

    Selects the event's vendors (``vendor_only=True``) or individual
    consignors, emits one block per seller using the identical 16-column row
    model, computes Due Seller at ``rate`` under the donate-proceeds >
    exemption > commission-rate rules, and orders blocks alphabetically by
    code with commission-exempt sellers last.
    """
    event = _get_event_or_404(db, event_id)  # re-raised 404 for direct callers
    exempt_codes = _exempt_seller_codes(event)

    query = db.query(Seller).filter(Seller.event_id == event_id)
    if vendor_only:
        query = query.filter(Seller.is_vendor.is_(True))
    else:
        query = query.filter(Seller.is_vendor.is_(False))
    sellers = query.order_by(Seller.code).all()

    blocks: list[VendorSalesBlock] = []
    for vendor in sellers:
        items = (
            db.query(Item)
            .filter(Item.seller_id == vendor.id, Item.is_deleted.is_(False))
            .order_by(Item.code)
            .all()
        )
        sale_items = (
            db.query(SaleItem)
            .join(Sale)
            .filter(SaleItem.item_id.in_([it.id for it in items]),
                    Sale.is_voided.is_(False))
            .all()
        )
        sold_by_item: dict[int, dict[str, float]] = {}
        for si in sale_items:
            item_key = int(getattr(si, "item_id", 0) or 0)  # str() coercions keep pyright clean on Column-typed ids (codebase idiom)
            agg = sold_by_item.setdefault(item_key, {"qty": 0.0, "value": 0.0})
            agg["qty"] += getattr(si, "quantity", 0.0) or 0.0
            agg["value"] += getattr(si, "extended_price", 0.0) or 0.0

        rows: list[VendorSalesItemRow] = []
        total_extend = 0.0
        total_sell_extend = 0.0
        total_due = 0.0
        total_unsold = 0.0
        total_donate = 0.0
        exempt = _seller_is_exempt(vendor, exempt_codes)
        company = getattr(vendor, "company", None)
        display = str(company) if company else \
            f"{getattr(vendor, 'first_name', '') or ''} {getattr(vendor, 'last_name', '') or ''}".strip()

        for it in items:
            qty_in = float(getattr(it, "quantity", 0.0) or 0.0)
            price = float(getattr(it, "price", 0.0) or 0.0)
            remaining = float(getattr(it, "remaining", 0.0) or 0.0)
            donate_unsold = bool(getattr(it, "donate_unsold", False))
            item_key = int(getattr(it, "id", 0) or 0)  # pyright: ignore[reportCallIssue,reportArgumentType]
            sold = sold_by_item.get(item_key, {"qty": 0.0, "value": 0.0})
            qty_sold = sold["qty"]
            sell_extend = sold["value"]
            sell_price = round(sell_extend / qty_sold, 2) if qty_sold else 0.0
            # Donate-unsold units leave with the charity; every other unit on
            # hand is unsold inventory the vendor takes back.
            unsold = 0.0 if donate_unsold else remaining * price
            donate = remaining * price if donate_unsold else 0.0
            # Due Seller is computed from the SOLD value only — unsold stock
            # nets the vendor nothing. Donate-proceeds lines zero the seller.
            donate_proceeds = bool(
                getattr(getattr(it, "intake", None), "donate_proceeds", False)
            )
            _, due = _split_line(sell_extend, donate_proceeds, rate, exempt)
            extend = qty_in * price
            rows.append(VendorSalesItemRow(
                seller_code=str(getattr(vendor, "code", "")),
                item_code=str(getattr(it, "code", "")),
                brand=getattr(it, "brand", None),
                type=getattr(it, "type", None),
                category=getattr(it, "category", None),
                size=getattr(it, "size", None),
                description=getattr(it, "description", None),
                qty_in=qty_in,
                price=price,
                extend=round(extend, 2),
                qty_sold=qty_sold,
                sell_price=sell_price,
                sell_extend=round(sell_extend, 2),
                due_seller=due,
                unsold=round(unsold, 2),
                donate=round(donate, 2),
            ))
            total_extend += extend
            total_sell_extend += sell_extend
            total_due += due
            total_unsold += unsold
            total_donate += donate

        blocks.append(VendorSalesBlock(
            vendor_code=str(getattr(vendor, "code", "")),
            vendor_name=display,
            rows=rows,
            total_extend=round(total_extend, 2),
            total_sell_extend=round(total_sell_extend, 2),
            total_due_seller=round(total_due, 2),
            total_unsold=round(total_unsold, 2),
            total_donate=round(total_donate, 2),
        ))

    # Exempt sellers (league merchandise) LAST, matching the legacy layout.
    ordered = [b for b in blocks if b.vendor_code.upper() not in exempt_codes] + \
        [b for b in blocks if b.vendor_code.upper() in exempt_codes]
    return VendorSalesWorkbook(
        event_id=event_id,
        event_name=str(getattr(event, "name", "")),
        commission_rate=rate,
        vendors=ordered,
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

    exempt_codes = _exempt_seller_codes(event)

    def _seller_code_for(si) -> str:
        seller = getattr(getattr(si.item, "seller", None), "code", "") or ""
        return str(seller).strip().upper()

    donate_proceeds_total = 0.0
    exempt_lines_total = 0.0
    mysl_line_total: float = 0.0
    seller_line_total = 0.0
    for s in non_voided:
        # The 3% card fee rides inside the STAMPED sale.mysl_total at checkout
        # (fee = MYSL revenue, never deducted from seller shares). Line-level
        # splits below cover the goods only — add the stamped fee back per sale
        # so mysl + seller + exempt + donate == gross_revenue exactly.
        fee = float(s.cc_fee or 0.0)  # pyright: ignore[reportCallIssue,reportArgumentType]
        mysl_line_total += fee
        for si in s.sale_items:
            donate = bool(si.item.intake.donate_proceeds) if si.item.intake is not None else False
            exempt = _seller_code_for(si) in exempt_codes
            if donate:
                donate_proceeds_total += si.extended_price  # full price to MYSL — exempt rule never applies
            elif exempt:
                # Event-level commission exemption (e.g. MYSL2): seller keeps
                # the full extended price; excluded from seller_total/mysl_total.
                exempt_lines_total += si.extended_price
            else:
                rate = (
                    getattr(si.item.seller, "is_vendor", False) and event.vendor_commission_rate
                ) or event.commission_rate  # pyright: ignore[reportGeneralTypeIssues]
                mysl_share, seller_share = _split_line(si.extended_price, donate, rate, exempt)  # pyright: ignore[reportArgumentType]
                mysl_line_total += mysl_share
                seller_line_total += seller_share

    return EventRevenueReport(
        event_id=event_id,
        event_name=event.name,  # pyright: ignore[reportArgumentType]
        event_year=event.year,  # pyright: ignore[reportArgumentType]
        total_sales=len(non_voided),
        voided_sales=len(voided),
        gross_revenue=round(sum(s.sale_total for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        mysl_total=round(mysl_line_total, 2),  # pyright: ignore[reportCallIssue,reportArgumentType]
        seller_total=round(seller_line_total, 2),
        cash_total=round(sum(s.cash_amount for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        check_total=round(sum(s.check_amount for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        cc_total=round(sum(s.cc_amount for s in non_voided), 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        donate_proceeds_total=round(donate_proceeds_total, 2),
        exempt_seller_codes=sorted(exempt_codes),
        exempt_lines_total=round(exempt_lines_total, 2),
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
        exempt_lines_total=rev.exempt_lines_total,
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


def get_check_transactions(db: Session, event_id: int) -> CheckTransactionsReport:
    """List every check-tendered transaction for an event (voided excluded).

    A sale qualifies when ``check_amount`` > 0 — this includes mixed
    tender (cash + check + card); the row reports the check portion and the
    sale's full total. Sorted newest first (by timestamp, then sale ID).
    """
    event = _get_event_or_404(db, event_id)
    sales = (
        db.query(Sale)
        .filter(
            Sale.event_id == event_id,  # pyright: ignore[reportArgumentType]
            Sale.is_voided.is_(False),  # pyright: ignore[reportAttributeAccessIssue]
            Sale.check_amount > 0,  # pyright: ignore[reportAttributeAccessIssue,reportOperatorIssue]
        )
        .order_by(Sale.date_of_sale.desc().nullslast(), Sale.id.desc())  # pyright: ignore[reportAttributeAccessIssue,reportCallIssue]
        .all()
    )

    transactions: list[CheckTransactionRow] = []
    for sale in sales:
        transactions.append(CheckTransactionRow(
            sale_id=sale.id,  # pyright: ignore[reportArgumentType]
            date_of_sale=sale.date_of_sale,  # pyright: ignore[reportArgumentType]
            cashier=str(sale.created_by) if sale.created_by else "(unknown)",  # pyright: ignore[reportGeneralTypeIssues,reportArgumentType]
            customer_name=sale.customer_name,  # pyright: ignore[reportArgumentType]
            check_number=sale.check_number,  # pyright: ignore[reportArgumentType]
            check_amount=round(sale.check_amount or 0.0, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
            sale_total=round(sale.sale_total or 0.0, 2),  # pyright: ignore[reportArgumentType,reportCallIssue]
        ))

    return CheckTransactionsReport(
        event_id=event_id,
        event_name=event.name,  # pyright: ignore[reportArgumentType]
        transactions=transactions,
        total_check_amount=round(sum(t.check_amount for t in transactions), 2),
        total_sale_amount=round(sum(t.sale_total for t in transactions), 2),
        count=len(transactions),
        generated_at=_now(),
    )
