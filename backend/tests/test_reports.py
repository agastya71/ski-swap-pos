import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller


@pytest.fixture
def rpt_seller(db, active_event):
    s = Seller(event_id=active_event.id, code="RPT", first_name="Report", last_name="Seller",
               is_vendor=False, created_by="admin")
    db.add(s); db.commit(); db.refresh(s)
    return s


@pytest.fixture
def rpt_intake(db, rpt_seller):
    i = Intake(seller_id=rpt_seller.id, donate_proceeds=False, donate_unsold=False,
               created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    return i


@pytest.fixture
def rpt_item(db, rpt_intake, rpt_seller):
    it = Item(intake_id=rpt_intake.id, seller_id=rpt_seller.id, code="RPT-001",
              price=25.00, quantity=1.0, remaining=0.0, status="sold", label_printed=True,
              created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


@pytest.fixture
def rpt_sale(db, active_event, rpt_item):
    s = Sale(event_id=active_event.id, sale_total=25.00, mysl_total=7.50,
             seller_total=17.50, cash_amount=25.00, check_amount=0.0, cc_amount=0.0,
             total_paid=25.00, balance_due=0.0, is_voided=False, created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=rpt_item.id, line_number=1,
                    quantity=1.0, sell_price=25.00, extended_price=25.00, created_by="admin"))
    db.commit(); db.refresh(s)
    return s


# ── Seller payout ─────────────────────────────────────────────────────────────

def test_seller_payout_json(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["seller_code"] == "RPT"
    assert data["gross_sales"] == 25.00


def test_seller_payout_csv(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}?format=csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_seller_payout_md(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}?format=md",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "markdown" in resp.headers["content-type"]


def test_seller_payout_pdf(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}?format=pdf",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


def test_seller_payout_wrong_event(client, admin_token):
    resp = client.get(
        "/reports/99999/seller/1",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_seller_payout_wrong_seller(client, admin_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/seller/99999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


# ── Revenue ───────────────────────────────────────────────────────────────────

def test_revenue_json(client, admin_token, active_event, rpt_sale):
    resp = client.get(
        f"/reports/{active_event.id}/revenue",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["gross_revenue"] == 25.00
    assert data["total_sales"] == 1


def test_revenue_wrong_event(client, admin_token):
    resp = client.get(
        "/reports/99999/revenue",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


# ── Donations ─────────────────────────────────────────────────────────────────

def test_donations_json(client, admin_token, active_event, rpt_sale):
    resp = client.get(
        f"/reports/{active_event.id}/donations",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "items" in resp.json()


# ── Unsold ────────────────────────────────────────────────────────────────────

def test_unsold_json_excludes_sold(client, admin_token, active_event, rpt_item):
    # rpt_item.status == "sold", so unsold count should be 0
    resp = client.get(
        f"/reports/{active_event.id}/unsold",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["total_items"] == 0


# ── End of day ────────────────────────────────────────────────────────────────

def test_end_of_day_json(client, admin_token, active_event, rpt_sale):
    resp = client.get(
        f"/reports/{active_event.id}/end-of-day",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["gross_revenue"] == 25.00
    assert data["sales_count"] == 1


# ── Format validation ─────────────────────────────────────────────────────────

def test_invalid_format_returns_422(client, admin_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/revenue?format=xml",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


# ── Auth ──────────────────────────────────────────────────────────────────────

def test_cashier_forbidden(client, cashier_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/revenue",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_intake_forbidden(client, intake_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/revenue",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


def test_unauthenticated_returns_403(client, active_event):
    resp = client.get(f"/reports/{active_event.id}/revenue")
    assert resp.status_code == 403


# ── Commission rate branching ─────────────────────────────────────────────────

def test_payout_uses_individual_rate_for_non_vendor(
    client, admin_token, db, active_event, rpt_sale, rpt_seller
):
    """Non-vendor seller: payout uses commission_rate (0.30), NOT vendor rate (0.25)."""
    active_event.vendor_commission_rate = 0.25
    db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # $25.00 * 0.30 = $7.50 MYSL, $17.50 seller
    assert data["mysl_total"] == 7.50
    assert data["seller_total"] == 17.50


def test_payout_uses_vendor_rate_for_vendor_seller(
    client, admin_token, db, active_event
):
    """Vendor seller: payout uses vendor_commission_rate (0.25), NOT individual rate (0.30)."""
    from app.models.intake import Intake
    from app.models.item import Item
    from app.models.sale import Sale
    from app.models.sale_item import SaleItem

    active_event.vendor_commission_rate = 0.25
    db.commit()

    vendor = Seller(
        event_id=active_event.id, code="VND", first_name="Vendor", last_name="Co",
        is_vendor=True, created_by="admin",
    )
    db.add(vendor)
    db.flush()

    intake = Intake(
        seller_id=vendor.id, donate_proceeds=False, donate_unsold=False, created_by="admin"
    )
    db.add(intake)
    db.flush()

    item = Item(
        intake_id=intake.id, seller_id=vendor.id, code="VND-001",
        price=100.00, quantity=0.0, status="sold", label_printed=True, created_by="admin",
    )
    db.add(item)
    db.flush()

    sale = Sale(
        event_id=active_event.id, sale_total=100.00, mysl_total=25.00,
        seller_total=75.00, cash_amount=100.00, check_amount=0.0, cc_amount=0.0,
        total_paid=100.00, balance_due=0.0, is_voided=False, created_by="admin",
    )
    db.add(sale)
    db.flush()
    db.add(SaleItem(
        sale_id=sale.id, item_id=item.id, line_number=1,
        quantity=1.0, sell_price=100.00, extended_price=100.00, created_by="admin",
    ))
    db.commit()
    db.refresh(vendor)

    resp = client.get(
        f"/reports/{active_event.id}/seller/{vendor.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # $100.00 * 0.25 vendor rate = $25.00 MYSL, $75.00 seller
    assert data["mysl_total"] == 25.00
    assert data["seller_total"] == 75.00
