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
    """A sold item's line carries mysl_share, seller_share, and the applied rate."""
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, sale.sale_items[0].item.seller_id)
    sold = [li for li in report.line_items if li.status == "sold"]
    assert len(sold) == 1
    li = sold[0]
    assert li.mysl_share == 4.5       # 15 * 0.30
    assert li.seller_share == 10.5    # 15 - 4.5
    assert li.commission_rate == 0.30


def test_seller_payout_non_sold_item_zero_shares(db, active_event, seller, intake, available_item):
    """A non-sold item line shows zero shares but still carries the applicable rate."""
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, seller.id)
    avail = [li for li in report.line_items if li.item_code == available_item.code]
    assert len(avail) == 1
    assert avail[0].mysl_share == 0.0
    assert avail[0].seller_share == 0.0
    assert avail[0].commission_rate == 0.30   # individual rate


def test_seller_payout_donate_proceeds_item_full_to_mysl(db, active_event, donate_sale):
    """A sold item from a donate_proceeds intake: mysl_share = extended_price, seller 0."""
    from app.services.reports import get_seller_payout
    report = get_seller_payout(db, active_event.id, donate_sale.sale_items[0].item.seller_id)
    li = [x for x in report.line_items if x.status == "sold"][0]
    assert li.mysl_share == 30.0
    assert li.seller_share == 0.0


def test_seller_payout_vendor_rate_applied(db, active_event):
    """A vendor seller's lines use the event's vendor_commission_rate."""
    from app.models.seller import Seller
    from app.models.intake import Intake
    from app.models.item import Item
    from app.models.sale import Sale
    from app.models.sale_item import SaleItem
    from app.services.reports import get_seller_payout

    active_event.vendor_commission_rate = 0.25
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

    report = get_seller_payout(db, active_event.id, vendor.id)
    li = [x for x in report.line_items if x.status == "sold"][0]
    assert li.commission_rate == 0.25
    assert li.mysl_share == 25.0
    assert li.seller_share == 75.0
