import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def seller(db, active_event):
    s = Seller(event_id=active_event.id, code="TST", first_name="Test", last_name="Seller",
               is_vendor=False, created_by="admin")
    db.add(s); db.commit(); db.refresh(s)
    return s


@pytest.fixture
def intake(db, seller):
    i = Intake(seller_id=seller.id, donate_proceeds=False, donate_unsold=False, created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    return i


@pytest.fixture
def donate_intake(db, seller):
    i = Intake(seller_id=seller.id, donate_proceeds=True, donate_unsold=False, created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    return i


@pytest.fixture
def available_item(db, intake, seller):
    it = Item(intake_id=intake.id, seller_id=seller.id, code="TST-001", price=20.00,
              quantity=1.0, status="available", label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def sold_item(db, intake, seller):
    it = Item(intake_id=intake.id, seller_id=seller.id, code="TST-002", price=15.00,
              quantity=1.0, remaining=0.0, status="sold", label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def donate_sold_item(db, donate_intake, seller):
    it = Item(intake_id=donate_intake.id, seller_id=seller.id, code="TST-003", price=30.00,
              quantity=1.0, remaining=0.0, status="sold", label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def sale(db, active_event, sold_item):
    s = Sale(event_id=active_event.id, sale_total=15.00, mysl_total=4.50,
             seller_total=10.50, cash_amount=15.00, check_amount=0.0, cc_amount=0.0,
             total_paid=15.00, balance_due=0.0, is_voided=False, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=sold_item.id, line_number=1,
                    quantity=1.0, sell_price=15.00, extended_price=15.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


@pytest.fixture
def voided_sale(db, active_event, available_item):
    s = Sale(event_id=active_event.id, sale_total=20.00, mysl_total=6.00,
             seller_total=14.00, cash_amount=20.00, check_amount=0.0, cc_amount=0.0,
             total_paid=20.00, balance_due=0.0, is_voided=True, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=available_item.id, line_number=1,
                    quantity=1.0, sell_price=20.00, extended_price=20.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


@pytest.fixture
def donate_sale(db, active_event, donate_sold_item):
    s = Sale(event_id=active_event.id, sale_total=30.00, mysl_total=30.00,
             seller_total=0.0, cash_amount=30.00, check_amount=0.0, cc_amount=0.0,
             total_paid=30.00, balance_due=0.0, is_voided=False, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=donate_sold_item.id, line_number=1,
                    quantity=1.0, sell_price=30.00, extended_price=30.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


# ── Seller payout ─────────────────────────────────────────────────────────────

def test_seller_payout_sums_sold_items(db, active_event, seller, sale, sold_item):
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    assert report.gross_sales == 15.00
    assert report.mysl_total == 4.50
    assert report.seller_total == 10.50
    assert report.items_sold == 1
    assert report.seller_code == "TST"


def test_seller_payout_includes_price_adjustment_reason(db, active_event, seller, sale, sold_item):
    """sale_item.notes — the cashier's price-adjustment reason — surfaces on
    the payout SALES line; lines without notes come through as None."""
    from app.services.reports import get_seller_payout
    si = sale.sale_items[0]
    si.notes = "Zipper broken - $5 off"
    db.commit()
    report = get_seller_payout(db, active_event.id, seller.id)
    line = next(s for s in report.sales if s.item_code == "TST-002")
    assert line.price_adjustment_reason == "Zipper broken - $5 off"

    si.notes = None
    db.commit()
    report2 = get_seller_payout(db, active_event.id, seller.id)
    line2 = next(s for s in report2.sales if s.item_code == "TST-002")
    assert line2.price_adjustment_reason is None


def test_seller_payout_excludes_voided(db, active_event, seller, voided_sale, available_item):
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    assert report.gross_sales == 0.0
    assert report.mysl_total == 0.0
    assert report.seller_total == 0.0


def test_seller_payout_donate_proceeds_zeroes_seller(db, active_event, seller, donate_sale, donate_sold_item):
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    assert report.seller_total == 0.0
    assert report.mysl_total == report.gross_sales


def test_seller_payout_no_sales_returns_zeros(db, active_event, seller, available_item):
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    assert report.gross_sales == 0.0
    assert report.items_consigned == 1


def test_seller_payout_wrong_event_raises_404(db, seller):
    from fastapi import HTTPException
    from app.services.reports import get_seller_payout
    with pytest.raises(HTTPException) as exc:
        get_seller_payout(db, 99999, seller.id)
    assert exc.value.status_code == 404


def test_seller_payout_wrong_seller_raises_404(db, active_event):
    from fastapi import HTTPException
    from app.services.reports import get_seller_payout
    with pytest.raises(HTTPException) as exc:
        get_seller_payout(db, active_event.id, 99999)
    assert exc.value.status_code == 404


# ── Event revenue ─────────────────────────────────────────────────────────────

def test_event_revenue_totals(db, active_event, sale, sold_item, seller, intake):
    from app.services.reports import get_event_revenue
    report = get_event_revenue(db, active_event.id)
    assert report.gross_revenue == 15.00
    assert report.total_sales == 1
    assert report.voided_sales == 0
    assert report.cash_total == 15.00


def test_event_revenue_excludes_voided(db, active_event, voided_sale, available_item, seller, intake):
    from app.services.reports import get_event_revenue
    report = get_event_revenue(db, active_event.id)
    assert report.gross_revenue == 0.0
    assert report.voided_sales == 1
    assert report.total_sales == 0


def test_event_revenue_donate_proceeds_total(db, active_event, donate_sale, donate_sold_item, seller, donate_intake):
    from app.services.reports import get_event_revenue
    report = get_event_revenue(db, active_event.id)
    assert report.donate_proceeds_total == 30.00


# ── Donations ─────────────────────────────────────────────────────────────────

def test_donations_proceeds_type(db, active_event, donate_sale, donate_sold_item, seller, donate_intake):
    from app.services.reports import get_donations
    report = get_donations(db, active_event.id)
    assert len(report.items) == 1
    assert report.items[0].donation_type == "proceeds"
    assert report.items[0].price == 30.00


def test_donations_unsold_type(db, active_event, seller):
    from app.models.intake import Intake
    from app.models.item import Item
    from app.services.reports import get_donations
    i = Intake(seller_id=seller.id, donate_proceeds=False, donate_unsold=True, created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    it = Item(intake_id=i.id, seller_id=seller.id, code="DU-001", price=10.00,
              quantity=1.0, remaining=1.0, status="available", label_printed=True,
              donate_unsold=True, created_by="admin")
    db.add(it); db.commit()
    report = get_donations(db, active_event.id)
    unsold = [x for x in report.items if x.donation_type == "unsold"]
    assert len(unsold) == 1
    assert unsold[0].item_code == "DU-001"


def test_donations_partially_sold_shows_remaining(db, active_event, seller):
    """A partially-sold donate-unsold item appears in donations with its
    remaining on-hand units (review finding D5) — not the intake quantity."""
    from app.models.intake import Intake
    from app.models.item import Item
    from app.services.reports import get_donations
    i = Intake(seller_id=seller.id, donate_proceeds=False, donate_unsold=True, created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    it = Item(intake_id=i.id, seller_id=seller.id, code="DU-002", price=10.00,
              quantity=5.0, remaining=3.0, status="sold", label_printed=True,
              donate_unsold=True, created_by="admin")
    db.add(it); db.commit()
    report = get_donations(db, active_event.id)
    unsold = [x for x in report.items if x.item_code == "DU-002"]
    assert len(unsold) == 1
    assert unsold[0].quantity == 5.0
    assert unsold[0].remaining == 3.0


# ── Unsold items ──────────────────────────────────────────────────────────────

def test_unsold_only_available(db, active_event, seller, intake, available_item, sold_item):
    from app.services.reports import get_unsold_items
    report = get_unsold_items(db, active_event.id)
    codes = [i.item_code for i in report.items]
    assert "TST-001" in codes
    assert "TST-002" not in codes


# ── End of day ────────────────────────────────────────────────────────────────

def test_end_of_day_matches_revenue(db, active_event, sale, sold_item, seller, intake):
    from app.services.reports import get_end_of_day, get_event_revenue
    rev = get_event_revenue(db, active_event.id)
    eod = get_end_of_day(db, active_event.id)
    assert eod.gross_revenue == rev.gross_revenue
    assert eod.sales_count == rev.total_sales
    assert eod.voided_count == rev.voided_sales


# ── per-item commission/payout/rate (Phase 7) ─────────────────────────────────

def test_seller_payout_per_item_shares(db, active_event, sale):
    """A sold item's SALES row carries mysl_share, seller_share, and the applied rate."""
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, sale.sale_items[0].item.seller_id)
    assert len(report.sales) == 1
    s = report.sales[0]
    assert s.item_code == "TST-002"
    assert s.mysl_share == 4.5       # 15 * 0.30
    assert s.seller_share == 10.5    # 15 - 4.5
    assert s.commission_rate == 0.30


def test_seller_payout_items_list_includes_unsold_item(db, active_event, seller, intake, available_item):
    """The single ITEMS list covers unsold items with original/remaining quantities."""
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    avail = [li for li in report.items if li.item_code == available_item.code]
    assert len(avail) == 1
    assert avail[0].quantity == 1.0
    assert avail[0].remaining == 1.0
    assert avail[0].price == available_item.price


def test_seller_payout_donate_proceeds_item_full_to_mysl(db, active_event, donate_sale):
    """A sold item from a donate_proceeds intake: mysl_share = extended_price, seller 0."""
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, donate_sale.sale_items[0].item.seller_id)
    s = [x for x in report.sales if x.item_code == "TST-003"][0]
    assert s.mysl_share == 30.0
    assert s.seller_share == 0.0


def test_seller_payout_vendor_rate_applied(db, active_event):
    """A vendor seller's lines use the event's vendor_commission_rate."""
    from app.models.seller import Seller
    from app.models.intake import Intake
    from app.models.item import Item
    from app.models.sale import Sale
    from app.models.sale_item import SaleItem
    from app.services.reports import get_seller_payout

    active_event.vendor_commission_rate = 0.25  # registry row
    db.commit()
    # The reports read the IN-DB event row — mirror the rate there (Phase G).
    from app.models.event import Event as _Ev
    ev_event = db.get(_Ev, active_event.id)
    ev_event.vendor_commission_rate = 0.25  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    vendor = Seller(event_id=active_event.id, code="VND", first_name=None, last_name=None,
                    company="Vendor Co", is_vendor=True, created_by="admin")
    db.add(vendor); db.commit(); db.refresh(vendor)
    intake = Intake(seller_id=vendor.id, donate_proceeds=False, created_by="admin")
    db.add(intake); db.commit(); db.refresh(intake)
    it = Item(intake_id=intake.id, seller_id=vendor.id, code="VND-001", price=100.0,
              quantity=0.0, status="sold", label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    sale = Sale(event_id=active_event.id, sale_total=100.0, mysl_total=25.0, seller_total=75.0,
                cash_amount=100.0, total_paid=100.0, is_voided=False, created_by="admin")
    db.add(sale); db.flush()
    db.add(SaleItem(sale_id=sale.id, item_id=it.id, line_number=1, quantity=1,
                    sell_price=100.0, extended_price=100.0, created_by="admin"))
    db.commit()

    report = get_seller_payout(db, active_event.id, vendor.id)  # pyright: ignore[reportArgumentType]
    s = [x for x in report.sales if x.item_code == "VND-001"][0]
    assert s.commission_rate == 0.25
    assert s.mysl_share == 25.0
    assert s.seller_share == 75.0


# ── Vendor equipment summary ─────────────────────────────────────────────────

def test_vendor_equipment_summary_groups_by_category(db, active_event):
    """Units/gross/shares group by item.category; TOTAL row sums everything."""
    from app.models.seller import Seller
    from app.models.intake import Intake
    from app.models.item import Item
    from app.services.reports import get_vendor_equipment_summary

    active_event.vendor_commission_rate = 0.30
    db.commit()
    vendor = Seller(event_id=active_event.id, code="VSUM", first_name=None, last_name=None,
                    company="Summary Vendor", is_vendor=True, created_by="admin")
    db.add(vendor); db.commit(); db.refresh(vendor)
    intake = Intake(seller_id=vendor.id, donate_proceeds=False, created_by="admin")
    db.add(intake); db.commit(); db.refresh(intake)

    skate = Item(intake_id=intake.id, seller_id=vendor.id, code="V1-1", category="Skis",
                 description="Skate ski", price=100.0, quantity=2.0, remaining=1.0,
                 status="sold", created_by="admin")
    classic = Item(intake_id=intake.id, seller_id=vendor.id, code="V1-2", category="Skis",
                   description="Classic ski", price=80.0, quantity=1.0, remaining=0.0,
                   status="sold", created_by="admin")
    boots = Item(intake_id=intake.id, seller_id=vendor.id, code="V1-3", category="Boots",
                 price=50.0, quantity=1.0, remaining=1.0, status="available", created_by="admin")
    db.add_all([skate, classic, boots]); db.commit()

    sale = Sale(event_id=active_event.id, sale_total=150.0, cash_amount=150.0,
                total_paid=150.0, is_voided=False, created_by="admin")
    db.add(sale); db.flush()
    db.add(SaleItem(sale_id=sale.id, item_id=skate.id, line_number=1, quantity=1.0,
                    sell_price=100.0, extended_price=100.0, created_by="admin"))
    db.add(SaleItem(sale_id=sale.id, item_id=classic.id, line_number=2, quantity=1.0,
                    sell_price=50.0, extended_price=50.0, created_by="admin"))
    db.commit()

    report = get_vendor_equipment_summary(db, active_event.id, vendor.id)  # pyright: ignore[reportArgumentType]
    skis = next(l for l in report.categories if l.category == "Skis")
    assert skis.items_consigned == 2
    assert skis.units_sold == 2.0
    assert skis.gross_sales == 150.0
    assert skis.mysl_share == 45.0  # 150 x 30% vendor rate
    assert skis.seller_share == 105.0
    assert skis.units_unsold == 1.0  # skate ski has 1 unit on hand
    assert skis.unsold_value == 100.0
    boots_row = next(l for l in report.categories if l.category == "Boots")
    assert boots_row.units_sold == 0.0
    assert boots_row.units_unsold == 1.0
    assert report.total.category == "TOTAL"
    assert report.total.units_sold == 2.0
    assert report.total.gross_sales == 150.0
    assert report.total.mysl_share == 45.0
    assert report.total.seller_share == 105.0
    assert report.total.unsold_value == 150.0  # skate 100 + boots 50
    assert report.seller_name == "Summary Vendor"


def test_vendor_equipment_summary_refuses_non_vendor(db, active_event, seller):
    from fastapi import HTTPException
    import pytest

    from app.services.reports import get_vendor_equipment_summary
    with pytest.raises(HTTPException) as exc:
        get_vendor_equipment_summary(db, active_event.id, seller.id)
    assert exc.value.status_code == 422


def test_vendor_equipment_summary_unknown_seller_404(db, active_event):
    from fastapi import HTTPException
    import pytest

    from app.services.reports import get_vendor_equipment_summary
    with pytest.raises(HTTPException) as exc:
        get_vendor_equipment_summary(db, active_event.id, 999999)
    assert exc.value.status_code == 404


# ── Exempt seller (MYSL2-style commission exemption) ─────────────────────────


def _exempt_event(db, active_event, codes="MYSL2"):
    """Put ``codes`` on the event's exempt list — registry row + mirrored row."""
    active_event.exempt_seller_codes = codes  # pyright: ignore[reportAttributeAccessIssue]
    from app.models.event import Event as _Ev
    ev_event = db.get(_Ev, active_event.id)
    ev_event.exempt_seller_codes = codes  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()


@pytest.fixture
def exempt_seller(db, active_event):
    s = Seller(event_id=active_event.id, code="MYSL2", first_name=None, last_name=None,
               company="MYSL", is_vendor=True, created_by="admin")
    db.add(s); db.commit(); db.refresh(s)
    return s


@pytest.fixture
def exempt_intake(db, exempt_seller):
    i = Intake(seller_id=exempt_seller.id, donate_proceeds=False, created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    return i


@pytest.fixture
def exempt_sold_item(db, exempt_intake, exempt_seller):
    it = Item(intake_id=exempt_intake.id, seller_id=exempt_seller.id, code="MY2-001",
              price=8.00, quantity=1.0, remaining=0.0, status="sold", label_printed=True,
              created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def exempt_sale(db, active_event, exempt_sold_item):
    # Stamped values deliberately WRONG (commission applied) — reports must
    # recompute from the line items, never trust the stamps.
    s = Sale(event_id=active_event.id, sale_total=8.00, mysl_total=2.40,
             seller_total=5.60, cash_amount=8.00, check_amount=0.0, cc_amount=0.0,
             total_paid=8.00, balance_due=0.0, is_voided=False, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=exempt_sold_item.id, line_number=1,
                    quantity=1.0, sell_price=8.00, extended_price=8.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


def test_seller_payout_exempt_full_price(db, active_event, exempt_seller, exempt_intake,
                                         exempt_sale, exempt_sold_item):
    """Exempt seller keeps the full extended price; commission is 0 even for a
    vendor seller — the stale stamped sale totals must NOT leak through."""
    from app.services.reports import get_seller_payout
    _exempt_event(db, active_event)
    report = get_seller_payout(db, active_event.id, exempt_seller.id)
    assert report.gross_sales == 8.00
    assert report.mysl_total == 0.00
    assert report.seller_total == 8.00
    line = report.sales[0]
    assert line.mysl_share == 0.00
    assert line.seller_share == 8.00
    # Rate still DISPLAYS the vendor rate; the exemption overrides the math.
    assert line.commission_rate == 0.30
    assert report.seller_info.commission_rate == 0.30


def test_seller_payout_exempt_overrides_vendor_rate(db, active_event, exempt_seller,
                                                    exempt_intake, exempt_sale):
    from app.services.reports import get_seller_payout
    active_event.vendor_commission_rate = 0.25  # pyright: ignore[reportAttributeAccessIssue]
    from app.models.event import Event as _Ev
    ev_event = db.get(_Ev, active_event.id)
    ev_event.vendor_commission_rate = 0.25  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    _exempt_event(db, active_event)
    report = get_seller_payout(db, active_event.id, exempt_seller.id)
    line = report.sales[0]
    assert line.commission_rate == 0.25
    assert line.mysl_share == 0.00
    assert line.seller_share == 8.00
    assert report.seller_total == 8.00


def test_event_revenue_exempt_seller_separate_line(db, active_event, sold_item, seller, intake,
                                                   exempt_seller, exempt_intake, exempt_sold_item):
    """A sale mixing regular + MYSL2 items: commission lines total normally,
    MYSL2's lines report on their own row and stay out of both totals."""
    from app.models.sale import Sale
    from app.models.sale_item import SaleItem
    from app.services.reports import get_event_revenue
    _exempt_event(db, active_event)
    mixed = Sale(event_id=active_event.id, sale_total=23.00, mysl_total=6.90,
                 seller_total=16.10, cash_amount=23.00, check_amount=0.0, cc_amount=0.0,
                 total_paid=23.00, balance_due=0.0, is_voided=False, created_by="admin")
    db.add(mixed); db.flush()
    db.add(SaleItem(sale_id=mixed.id, item_id=sold_item.id, line_number=1, quantity=1.0,
                    sell_price=15.00, extended_price=15.00, created_by="admin"))
    db.add(SaleItem(sale_id=mixed.id, item_id=exempt_sold_item.id, line_number=2, quantity=1.0,
                    sell_price=8.00, extended_price=8.00, created_by="admin"))
    db.commit()
    report = get_event_revenue(db, active_event.id)
    assert report.gross_revenue == 23.00
    assert report.mysl_total == 4.50       # 15 × 0.30 — the 8.00 MYSL2 line adds 0
    assert report.seller_total == 10.50    # regular seller share only
    assert report.exempt_lines_total == 8.00
    assert report.exempt_seller_codes == ["MYSL2"]
    assert round(report.mysl_total + report.seller_total + report.exempt_lines_total, 2) \
        == report.gross_revenue


def test_event_revenue_exempt_codes_case_insensitive(db, active_event, exempt_sale,
                                                     exempt_sold_item, exempt_seller, exempt_intake):
    from app.services.reports import get_event_revenue
    _exempt_event(db, active_event, codes="mysl2")
    report = get_event_revenue(db, active_event.id)
    assert report.exempt_lines_total == 8.00
    assert report.mysl_total == 0.00
    assert report.seller_total == 0.00
    assert report.exempt_seller_codes == ["MYSL2"]


def test_event_revenue_donate_beats_exempt_and_buckets_split(db, active_event, donate_sale,
                                                             donate_sold_item, seller, donate_intake,
                                                             sale, sold_item, exempt_sale):
    """Rule order: donate lines go to MYSL regardless of exemption; the three
    buckets (commissioned, exempt, donate) stay separate rows."""
    from app.models.item import Item
    from app.models.sale import Sale
    from app.models.sale_item import SaleItem
    from app.services.reports import get_event_revenue
    _exempt_event(db, active_event)
    report = get_event_revenue(db, active_event.id)
    assert report.donate_proceeds_total == 30.00
    assert report.exempt_lines_total == 8.00
    assert report.mysl_total == 4.50
    assert report.seller_total == 10.50
    assert report.gross_revenue == 53.00


def test_event_revenue_card_fee_in_mysl_identity(db, active_event, seller, intake):
    """The stamped cc_fee rides inside mysl_total at checkout; the line-level
    recompute must add it back so mysl + seller + exempt + donate == gross."""
    from app.models.item import Item
    from app.models.sale import Sale
    from app.models.sale_item import SaleItem
    from app.services.reports import get_event_revenue
    it = Item(intake_id=intake.id, seller_id=seller.id, code="FEE-001", price=30.00,
              quantity=1.0, remaining=0.0, status="sold", label_printed=True,
              created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    # Fully card-financed $30.00 sale: terminal 30.87, fee 0.87 → MYSL side.
    s = Sale(event_id=active_event.id, sale_total=30.87, cc_fee=0.87,
             mysl_total=9.87, seller_total=21.00, cash_amount=0.0, check_amount=0.0,
             cc_amount=30.00, total_paid=30.00, balance_due=0.87, is_voided=False,
             created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=it.id, line_number=1, quantity=1.0,
                    sell_price=30.00, extended_price=30.00, created_by="admin"))
    db.commit()
    r = get_event_revenue(db, active_event.id)
    assert r.gross_revenue == 30.87
    assert r.mysl_total == 9.87          # 30 × 0.30 + 0.87 fee
    assert r.seller_total == 21.00
    assert r.exempt_lines_total == 0.0
    assert round(r.mysl_total + r.seller_total + r.exempt_lines_total
                 + r.donate_proceeds_total, 2) == r.gross_revenue


# ── Vendor sales workbook (legacy Retailer_Sales layout) ─────────────────────


def _vendor_with_items(db, active_event, *, code="Finn Sisu Vendor", company="Finn Sisu",
                       items=None):
    """Create a vendor seller + intake and return (seller, intake, items)."""
    vendor = Seller(event_id=active_event.id, code=code, first_name=None, last_name=None,
                    company=company, is_vendor=True, created_by="admin")
    db.add(vendor); db.commit(); db.refresh(vendor)
    intake = Intake(seller_id=vendor.id, donate_proceeds=False, donate_unsold=False,
                    created_by="admin")
    db.add(intake); db.commit(); db.refresh(intake)
    created = []
    for spec in (items or []):
        it = Item(intake_id=intake.id, seller_id=vendor.id, label_printed=True,
                  created_by="admin", **spec)
        db.add(it)
        created.append(it)
    db.commit()
    for it in created:
        db.refresh(it)
    return vendor, intake, created


def _vendor_sales_line(db, active_event, item, quantity, sell_price):
    """Attach one non-voided sale line selling ``quantity`` of ``item``."""
    s = Sale(event_id=active_event.id, sale_total=quantity * sell_price,
             mysl_total=0.0, seller_total=0.0, cash_amount=quantity * sell_price,
             total_paid=quantity * sell_price, is_voided=False, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=item.id, line_number=1, quantity=quantity,
                    sell_price=sell_price, extended_price=quantity * sell_price,
                    created_by="admin"))
    db.commit()
    return s


def test_vendor_sales_basic_math(db, active_event):
    """Item row math matches the legacy sheet: Extend = qty×price, Sell Price
    = achieved average, Due Seller = 85% at vendor rate 0.15, Unsold at list."""
    from app.services.reports import get_vendor_sales_report
    active_event.vendor_commission_rate = 0.15  # registry row
    from app.models.event import Event as _Ev
    ev_event = db.get(_Ev, active_event.id)
    ev_event.vendor_commission_rate = 0.15  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()

    vendor, intake, items = _vendor_with_items(db, active_event, items=[
        dict(code="FIN-1", description="Cobra", brand="Rossignol", type="Skate",
             category="Skis", size="186cm", price=50.0, quantity=1.0, remaining=1.0,
             status="available"),
        dict(code="FIN-2", description="Wraps", brand=None, type=None, category=None,
             size=None, price=3.0, quantity=3.0, remaining=1.0, status="available"),
    ])
    # FIN-2 sells at a mix of prices: 1 × $2 and 1 × $4 → avg $3.00.
    s1 = _vendor_sales_line(db, active_event, items[1], 1, 2.0)
    _vendor_sales_line(db, active_event, items[1], 1, 4.0)

    report = get_vendor_sales_report(db, active_event.id)
    assert report.commission_rate == 0.15
    fin = report.vendors[0]
    assert fin.vendor_code == vendor.code
    assert fin.vendor_name == "Finn Sisu"
    r1, r2 = fin.rows
    assert (r1.qty_in, r1.price, r1.extend, r1.qty_sold, r1.sell_extend) == (1.0, 50.0, 50.0, 0.0, 0.0)
    assert r1.sell_price == 0.0 and r1.due_seller == 0.0
    assert r1.unsold == 50.0 and r1.donate == 0.0
    assert (r2.qty_in, r2.price, r2.extend) == (3.0, 3.0, 9.0)
    assert r2.qty_sold == 2.0
    assert r2.sell_extend == 6.0
    assert r2.sell_price == 3.0          # average achieved price, like 2025
    # Due seller = 15% commission on the achieved value (no donated/exempt lines).
    assert r2.due_seller == round(6.0 * 0.85, 2) == 5.10
    assert r2.unsold == 3.0              # 1 remaining × $3 list
    assert fin.total_extend == 59.0 and fin.total_sell_extend == 6.0
    assert fin.total_due_seller == 5.10 and fin.total_unsold == 53.0


def test_vendor_sales_voided_sales_excluded(db, active_event):
    """Voided sale lines must not count toward Qty Sold / Sell Extend."""
    from app.services.reports import get_vendor_sales_report
    vendor, intake, items = _vendor_with_items(db, active_event, items=[
        dict(code="V-1", price=10.0, quantity=2.0, remaining=2.0, status="available"),
    ])
    s = Sale(event_id=active_event.id, sale_total=10.0, mysl_total=0.0, seller_total=0.0,
             cash_amount=10.0, total_paid=10.0, is_voided=True, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=items[0].id, line_number=1, quantity=1.0,
                    sell_price=10.0, extended_price=10.0, created_by="admin"))
    db.commit()
    report = get_vendor_sales_report(db, active_event.id)
    row = report.vendors[0].rows[0]
    assert row.qty_sold == 0.0 and row.sell_extend == 0.0


def test_vendor_sales_donate_unsold_split(db, active_event):
    """ donate_unsold items land in the Donate column; others in Unsold."""
    from app.services.reports import get_vendor_sales_report
    vendor, intake, items = _vendor_with_items(db, active_event, items=[
        dict(code="D-1", price=7.0, quantity=2.0, remaining=2.0, status="available",
             donate_unsold=True),
        dict(code="K-1", price=5.0, quantity=1.0, remaining=1.0, status="available"),
    ])
    report = get_vendor_sales_report(db, active_event.id)
    d, k = report.vendors[0].rows
    assert d.donate == 14.0 and d.unsold == 0.0
    assert k.donate == 0.0 and k.unsold == 5.0
    assert report.vendors[0].total_donate == 14.0
    assert report.vendors[0].total_unsold == 5.0


def test_vendor_sales_exempt_seller_last_and_full_due(db, active_event):
    """Exempt league vendor sorts LAST and keeps the full sell value in Due
    Seller (no commission), mirroring 'MYSL Merchandise' at the sheet bottom."""
    from app.services.reports import get_vendor_sales_report
    _exempt_event(db, active_event)
    active_event.vendor_commission_rate = 0.15  # registry row
    from app.models.event import Event as _Ev
    ev_event = db.get(_Ev, active_event.id)
    ev_event.vendor_commission_rate = 0.15  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    atom, _, atom_items = _vendor_with_items(db, active_event, code="ATOM1",
                                             company="Atomic", items=[
        dict(code="AT-1", price=100.0, quantity=1.0, remaining=0.0, status="sold"),
    ])
    mysl, _, mysl_items = _vendor_with_items(db, active_event, code="MYSL2",
                                             company="MYSL Merchandise", items=[
        dict(code="MY-1", price=3.0, quantity=3.0, remaining=1.0, status="available"),
    ])
    _vendor_sales_line(db, active_event, atom_items[0], 1, 100.0)
    _vendor_sales_line(db, active_event, mysl_items[0], 2, 3.0)

    report = get_vendor_sales_report(db, active_event.id)
    codes = [b.vendor_code for b in report.vendors]
    assert codes == ["ATOM1", "MYSL2"]   # exempt LAST, alphabetical otherwise
    atom_block, mysl_block = report.vendors
    assert atom_block.rows[0].due_seller == 85.0   # 15% vendor commission
    assert mysl_block.rows[0].due_seller == 6.0    # exempt keeps full $6
    assert mysl_block.vendor_name == "MYSL Merchandise"


def test_vendor_sales_donate_proceeds_zeroes_due(db, active_event):
    """A donate-proceeds vendor line pays the seller nothing."""
    from app.services.reports import get_vendor_sales_report
    from app.models.intake import Intake as _Intake
    vendor, intake, items = _vendor_with_items(db, active_event, items=[
        dict(code="DP-1", price=20.0, quantity=1.0, remaining=0.0, status="sold"),
    ])
    intake.donate_proceeds = True  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    _vendor_sales_line(db, active_event, items[0], 1, 20.0)
    report = get_vendor_sales_report(db, active_event.id)
    row = report.vendors[0].rows[0]
    assert row.sell_extend == 20.0 and row.due_seller == 0.0


def test_vendor_sales_excludes_non_vendors_and_deleted(db, active_event):
    """Individual (non-vendor) sellers get no block; deleted items are skipped."""
    from app.services.reports import get_vendor_sales_report
    from app.models.item import Item as _Item
    vendor, intake, items = _vendor_with_items(db, active_event, items=[
        dict(code="X-1", price=9.0, quantity=1.0, remaining=1.0, status="available"),
        dict(code="X-2", price=9.0, quantity=1.0, remaining=1.0, status="available"),
    ])
    nonvendor = Seller(event_id=active_event.id, code="PERSON", first_name="Pat",
                       last_name="Consignor", is_vendor=False, created_by="admin")
    db.add(nonvendor); db.commit()
    items[1].is_deleted = True
    db.commit()
    report = get_vendor_sales_report(db, active_event.id)
    assert [b.vendor_code for b in report.vendors] == [vendor.code]
    assert [r.item_code for r in report.vendors[0].rows] == ["X-1"]
