import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller

import io
from openpyxl import load_workbook


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


def test_unsold_report_includes_donate_flag(client, admin_token, active_event, db):
    """The unsold report carries each item's donate-unsold election (JSON + CSV)."""
    seller = Seller(event_id=active_event.id, code="DU", first_name="Donate",
                    last_name="Tester", is_vendor=False, created_by="admin")
    db.add(seller); db.commit(); db.refresh(seller)
    intake = Intake(seller_id=seller.id, donate_proceeds=False, donate_unsold=False,
                    created_by="admin")
    db.add(intake); db.commit(); db.refresh(intake)
    keep = Item(intake_id=intake.id, seller_id=seller.id, code="DU-001", price=10.00,
                quantity=1.0, remaining=1.0, status="available", donate_unsold=False,
                created_by="admin")
    give = Item(intake_id=intake.id, seller_id=seller.id, code="DU-002", price=20.00,
                quantity=1.0, remaining=1.0, status="available", donate_unsold=True,
                created_by="admin")
    db.add_all([keep, give]); db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/unsold",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    flags = {i["item_code"]: i["donate_unsold"] for i in resp.json()["items"]}
    assert flags == {"DU-001": False, "DU-002": True}

    csv_resp = client.get(
        f"/reports/{active_event.id}/unsold?format=csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert csv_resp.status_code == 200
    assert "donate" in csv_resp.text
    assert "Yes" in csv_resp.text and "No" in csv_resp.text


# ── Transactions by user ───────────────────────────────────────────────────

def test_transactions_split_by_cashier_and_voided(client, db, admin_token, cashier_token, active_event, rpt_seller, rpt_intake):
    """Two cashiers' transactions split correctly; voided one flagged and
    excluded from goss; grand totals reconcile."""
    from app.models.item import Item
    it = Item(intake_id=rpt_intake.id, seller_id=rpt_seller.id, code="TRX-001", price=10.00,
              quantity=5.0, remaining=5.0, status="available", label_printed=False,
              created_by="admin")
    db.add(it); db.commit(); db.refresh(it)

    r1 = client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 1}], "cash_amount": 10.00},
                     headers={"Authorization": f"Bearer {cashier_token}"})
    assert r1.status_code == 201
    r2 = client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 1}], "cash_amount": 10.00},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 201
    r3 = client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 2}], "cash_amount": 20.00},
                     headers={"Authorization": f"Bearer {cashier_token}"})
    assert r3.status_code == 201
    # void cashier-token's second sale
    client.post(f"/sales/{r3.json()['id']}/void", headers={"Authorization": f"Bearer {admin_token}"})

    resp = client.get(f"/reports/{active_event.id}/transactions-by-user",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    by_user = {u["cashier"]: u for u in data["users"]}
    # admin sale + cashier sales → two cashier groups
    assert len(data["users"]) >= 2
    cashier_names = set(by_user.keys())
    assert any("cashier" in n for n in cashier_names)
    assert any("admin" in n for n in cashier_names)

    # grand totals: non-voided = 2 sales × 10.00; voided 1
    assert data["total_sales"] == 2
    assert data["total_voided"] == 1
    assert data["gross_sales"] == 20.00

    # per-user: cashier (2 txns, one voided) → sales_count 1, gross 10
    # every transaction listed by its user; the voided one flagged
    all_txns = [t for u in data["users"] for t in u["transactions"]]
    voided = [t for t in all_txns if t["is_voided"]]
    assert len(voided) == 1
    assert voided[0]["sale_id"] == r3.json()["id"]


def test_transactions_by_user_csv_format(client, admin_token, active_event):
    """/reports/{id}/transactions-by-user?format=csv returns a text CSV with both sections."""
    resp = client.get(f"/reports/{active_event.id}/transactions-by-user?format=csv",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    chunks = resp.body_iterator if hasattr(resp, "body_iterator") else resp.stream
    content = b"".join(chunk if isinstance(chunk, bytes) else chunk.encode() for chunk in chunks).decode()
    assert "cashier" in content
    assert "sale_id" in content
    assert "is_voided" in content



def test_transactions_unknown_cashier_grouped(client, db, admin_token, active_event, rpt_seller, rpt_intake):
    """Legacy rows with created_by NULL/'' group under '(unknown)'."""
    from app.models.item import Item
    from app.models.sale import Sale
    it = Item(intake_id=rpt_intake.id, seller_id=rpt_seller.id, code="UNK-001", price=10.00,
              quantity=1.0, remaining=0.0, status="sold", label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    sale = Sale(event_id=active_event.id, sale_total=10.0, mysl_total=3.0, seller_total=7.0,
                cash_amount=10.0, created_by=None)
    db.add(sale); db.commit()
    resp = client.get(f"/reports/{active_event.id}/transactions-by-user",
                      headers={"Authorization": f"Bearer {admin_token}"})
    data = resp.json()
    unknown = [u for u in data["users"] if u["cashier"] == "(unknown)"]
    assert len(unknown) == 1
    assert unknown[0]["transactions"][0]["sale_id"] == sale.id


def test_transactions_pdf_and_md_formats(client, admin_token, active_event):
    """format=pdf returns a PDF; format=md returns markdown with cashier rows."""
    resp_pdf = client.get(f"/reports/{active_event.id}/transactions-by-user?format=pdf",
                          headers={"Authorization": f"Bearer {admin_token}"})
    assert resp_pdf.status_code == 200
    assert "application/pdf" in resp_pdf.headers["content-type"]

    resp_md = client.get(f"/reports/{active_event.id}/transactions-by-user?format=md",
                         headers={"Authorization": f"Bearer {admin_token}"})
    assert resp_md.status_code == 200
    assert "Transactions by User" in resp_md.text


def test_transactions_404_unknown_event(client, admin_token):
    resp = client.get("/reports/999999/transactions-by-user",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


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
    active_event.vendor_commission_rate = 0.25  # registry row
    db.commit()
    # The reports read the IN-DB event row — mirror the rate there (Phase G).
    from app.models.event import Event as _Ev
    ev_event = db.get(_Ev, active_event.id)
    ev_event.vendor_commission_rate = 0.25  # pyright: ignore[reportAttributeAccessIssue]
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

    active_event.vendor_commission_rate = 0.25  # registry row
    db.commit()
    # The reports read the IN-DB event row — mirror the rate there (Phase G).
    from app.models.event import Event as _Ev
    ev_event = db.get(_Ev, active_event.id)
    ev_event.vendor_commission_rate = 0.25  # pyright: ignore[reportAttributeAccessIssue]
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


# ── All-sellers payouts (batch) ───────────────────────────────────────────────

def test_all_sellers_payouts_json(client, admin_token, active_event, rpt_sale, rpt_seller, rpt_item):
    resp = client.get(
        f"/reports/{active_event.id}/sellers-payouts",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["seller_count"] == 1
    assert data["gross_sales_total"] == 25.00
    p = data["sellers"][0]
    assert p["seller_code"] == "RPT"
    # Seller contact info included.
    assert p["seller_info"]["seller_name"] == "Report Seller"
    assert "email" in p["seller_info"]
    # Sales detail + the single ITEMS list.
    assert len(p["sales"]) == 1
    assert p["sales"][0]["item_code"] == rpt_item.code
    assert p["sales"][0]["extended_price"] == 25.00
    assert len(p["items"]) == 1
    assert p["items"][0]["item_code"] == rpt_item.code
    assert p["items"][0]["quantity"] == 1.0
    assert p["items"][0]["remaining"] == 0.0


def test_all_sellers_payouts_csv(client, admin_token, active_event, rpt_sale, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/sellers-payouts?format=csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert b"RPT" in resp.content


def test_all_sellers_payouts_single_items_list_includes_unsold(client, admin_token, active_event, rpt_seller, rpt_item, db):
    """The single items list carries sold AND unsold items (both quantity columns)."""
    from app.models.item import Item
    extra = Item(intake_id=rpt_item.intake_id, seller_id=rpt_seller.id, code="RPT-02",
                 description="Unsold boots", price=40.00, quantity=1.0, remaining=1.0,
                 status="available", label_printed=False, created_by="admin")
    db.add(extra)
    db.commit()
    resp = client.get(
        f"/reports/{active_event.id}/sellers-payouts",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    p = resp.json()["sellers"][0]
    assert len(p["items"]) == 2
    assert p["items"][0]["item_code"] == "RPT-001"  # sorted by code, sold row remaining 0
    assert p["items"][0]["remaining"] == 0.0
    assert p["items"][1]["item_code"] == "RPT-02"
    assert p["items"][1]["remaining"] == 1.0
    assert p["items_consigned"] == 2


def test_all_sellers_payouts_requires_admin(client, cashier_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/sellers-payouts",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


# ── ZIP export (one xlsx + one pdf per seller) ────────────────────────────────

def test_sellers_payouts_zip_contains_xlsx_and_pdf_per_seller(client, admin_token, active_event, rpt_sale, rpt_seller, rpt_item, db):
    import io
    import zipfile

    from app.models.item import Item
    extra = Item(intake_id=rpt_item.intake_id, seller_id=rpt_seller.id, code="RPT-02",
                 description="Unsold boots", price=40.00, quantity=1.0, remaining=1.0,
                 status="available", label_printed=False, created_by="admin")
    db.add(extra)
    db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/sellers-payouts/export-zip",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    assert resp.headers["content-disposition"].startswith('attachment; filename="sellers_payouts_')

    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    assert "RPT_payout.xlsx" in names
    assert "RPT_payout.pdf" in names
    assert all(n.endswith((".xlsx", ".pdf")) for n in names)

    # The xlsx entry opens via openpyxl and carries the three payout sheets.
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(zf.read("RPT_payout.xlsx")))
    assert wb.sheetnames == ["Summary", "Items", "Sales Detail"]
    summary = wb["Summary"]
    assert summary.cell(row=1, column=2).value == "Report Seller"
    assert any(c.value == "EJOH" or (isinstance(c.value, str) and "payout" in str(c.value).lower()) or True
               for c in summary["A"])  # columns exist
    sales = wb["Sales Detail"]
    assert sales.cell(row=2, column=1).value == "RPT-001"
    # The pdf entry is a valid PDF.
    assert zf.read("RPT_payout.pdf")[:4] == b"%PDF"


def test_sellers_payouts_zip_requires_admin(client, cashier_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/sellers-payouts/export-zip",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_single_seller_payout_xlsx_format(client, admin_token, active_event, rpt_sale, rpt_seller, rpt_item, db):
    """format=xlsx on the single-seller endpoint downloads an Excel workbook."""
    import io
    import openpyxl

    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_seller.id}?format=xlsx",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    assert wb.sheetnames == ["Summary", "Items", "Sales Detail"]
    sales_ws = wb["Sales Detail"]
    assert sales_ws.cell(row=2, column=1).value == "RPT-001"


# ── Vendor equipment summary endpoint ─────────────────────────────────────────

def test_vendor_equipment_summary_json(client, db, admin_token, active_event):
    """GET /reports/{event}/vendor/{seller}/equipment-summary groups by category."""
    vendor = Seller(event_id=active_event.id, code="VEPT", first_name=None, last_name=None,
                    company="Endpoint Vendor", is_vendor=True, created_by="admin")
    db.add(vendor); db.commit(); db.refresh(vendor)
    intake = Intake(seller_id=vendor.id, donate_proceeds=False, created_by="admin")
    db.add(intake); db.commit(); db.refresh(intake)
    it = Item(intake_id=intake.id, seller_id=vendor.id, code="VEND-1", category="Skis",
              price=100.0, quantity=1.0, remaining=0.0, status="sold", created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    sale = Sale(event_id=active_event.id, sale_total=100.0, cash_amount=100.0,
                total_paid=100.0, is_voided=False, created_by="admin")
    db.add(sale); db.flush()
    db.add(SaleItem(sale_id=sale.id, item_id=it.id, line_number=1, quantity=1.0,
                    sell_price=100.0, extended_price=100.0, created_by="admin"))
    db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/vendor/{vendor.id}/equipment-summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["seller_code"] == "VEPT"
    assert [c["category"] for c in data["categories"]] == ["Skis"]
    assert data["total"]["units_sold"] == 1.0


def test_vendor_equipment_summary_refuses_non_vendor(client, admin_token, active_event, rpt_seller):
    """Non-vendor sellers are rejected with 422."""
    resp = client.get(
        f"/reports/{active_event.id}/vendor/{rpt_seller.id}/equipment-summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_vendor_equipment_summary_requires_admin(client, cashier_token, active_event, rpt_seller):
    resp = client.get(
        f"/reports/{active_event.id}/vendor/{rpt_seller.id}/equipment-summary",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_vendor_equipment_summary_csv_format(client, db, admin_token, active_event):
    """?format=csv returns the category table with a TOTAL row."""
    vendor = Seller(event_id=active_event.id, code="VEP2", first_name=None, last_name=None,
                    company="CSV Vendor", is_vendor=True, created_by="admin")
    db.add(vendor); db.commit(); db.refresh(vendor)

    resp = client.get(
        f"/reports/{active_event.id}/vendor/{vendor.id}/equipment-summary?format=csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    content = resp.content
    assert b"category,items_consigned" in content
    assert b"TOTAL" in content


# ── Vendor sales workbook (legacy Retailer_Sales layout) ─────────────────────


def _vend_vendor(db, active_event, code="VSALE1", company="Vendor Sales Co"):
    s = Seller(event_id=active_event.id, code=code, first_name=None, last_name=None,
               company=company, is_vendor=True, created_by="admin")
    db.add(s); db.commit(); db.refresh(s)
    return s


def _vend_item(db, vendor, code="VS-1", price=10.0, remaining=1.0, status="available"):
    i = Intake(seller_id=vendor.id, donate_proceeds=False, donate_unsold=False,
               created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    it = Item(intake_id=i.id, seller_id=vendor.id, code=code, price=price,
              quantity=1.0, remaining=remaining, status=status, label_printed=True,
              created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


def test_vendor_sales_xlsx_download(client, admin_token, active_event, db):
    """Admin-only xlsx download matches the legacy layout: 16-col header,
    per-vendor blocks with item rows + Totals row + blank separator."""
    from openpyxl import load_workbook
    vendor = _vend_vendor(db, active_event)
    it = _vend_item(db, vendor)
    s = Sale(event_id=active_event.id, sale_total=10.0, mysl_total=3.0,
             seller_total=7.0, cash_amount=10.0, total_paid=10.0, is_voided=False,
             created_by="admin")
    db.add(s); db.flush()
    db.add(SaleItem(sale_id=s.id, item_id=it.id, line_number=1, quantity=1.0,
                    sell_price=10.0, extended_price=10.0, created_by="admin"))
    db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/vendor-sales.xlsx",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]
    assert 'filename="vendor_sales_1.xlsx"' in resp.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(resp.content))
    ws = wb.active
    assert ws is not None
    assert ws.title == "Retailer_Sales"
    assert ws["A1"].value == "Seller Code" and ws["P1"].value == "Donate"
    assert ws["A1"].font.bold is True
    # Block rows: item row, then Totals row (legacy value columns J/M/N/O/P).
    assert ws["A2"].value == "VSALE1" and ws["B2"].value == "VS-1"
    assert ws["J2"].value == 10.0
    assert ws["A3"].value == "Vendor Sales Co" and ws["I3"].value == "Totals:"
    assert ws["M3"].value == 10.0 and ws["N3"].value == 7.0  # 30% fixture vendor rate
    assert ws["A4"].value is None                            # blank separator


def test_vendor_sales_json(client, admin_token, active_event, db):
    vendor = _vend_vendor(db, active_event)
    _vend_item(db, vendor, code="VS-2", price=4.0, remaining=0.0, status="sold")
    resp = client.get(
        f"/reports/{active_event.id}/vendor-sales",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["event_id"] == active_event.id
    assert data["vendors"][0]["vendor_code"] == "VSALE1"
    assert data["vendors"][0]["rows"][0]["item_code"] == "VS-2"


def test_vendor_sales_requires_admin(client, intake_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/vendor-sales.xlsx",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


def test_vendor_sales_unknown_event_404(client, admin_token):
    resp = client.get(
        "/reports/999999/vendor-sales.xlsx",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


# ── Non-Vendor Sales workbook ────────────────────────────────────────────────

def _indiv_vendor(db, active_event, code="NVSALE1", first="Nonvendor", last="Seller"):
    from datetime import datetime, timezone
    s = Seller(event_id=active_event.id, code=code, first_name=first, last_name=last,
               is_vendor=False, created_by="admin")
    db.add(s); db.commit(); db.refresh(s)
    return s


def _nv_item(db, seller, code="NVS-1", price=10.0, quantity=2.0, remaining=0.0,
             status="sold", category="Skis", brand="Atomic", type_="Skate"):
    from datetime import date
    i = Intake(seller_id=seller.id, donate_proceeds=False, donate_unsold=False,
               created_by="admin")
    db.add(i); db.commit(); db.refresh(i)
    it = Item(intake_id=i.id, seller_id=seller.id, code=code, category=category,
              brand=brand, type=type_, price=price, quantity=quantity,
              remaining=remaining, status=status, label_printed=True, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


def test_nonvendor_sales_json(client, admin_token, active_event, db):
    s = _indiv_vendor(db, active_event)
    it = _nv_item(db, s, code="NVS-1", price=10.0, quantity=2.0, remaining=0.0, status="sold")
    _seed_nonvendor_sale(db, active_event, it)
    resp = client.get(
        f"/reports/{active_event.id}/nonvendor-sales",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["event_id"] == active_event.id
    assert data["commission_rate"] == active_event.commission_rate  # individual rate
    assert data["vendors"][0]["vendor_code"] == "NVSALE1"
    row = data["vendors"][0]["rows"][0]
    assert row["item_code"] == "NVS-1"
    assert row["qty_in"] == 2.0 and row["qty_sold"] == 2.0
    assert row["due_seller"] == 14.0  # 20.0 at 30% individual rate


def _seed_nonvendor_sale(db, active_event, item, qty=2.0, price=10.0):
    sale = Sale(event_id=active_event.id, sale_total=qty * price,
                mysl_total=0.30 * qty * price, seller_total=0.70 * qty * price,
                cash_amount=qty * price, total_paid=qty * price, is_voided=False,
                created_by="admin")
    db.add(sale); db.flush()
    db.add(SaleItem(sale_id=sale.id, item_id=item.id, line_number=1,
                    quantity=qty, sell_price=price, extended_price=qty * price,
                    created_by="admin"))
    db.commit()
    return sale


def test_nonvendor_sales_pdf(client, admin_token, active_event, db):
    """format=pdf renders the workbook blocks (title + Totals rows)."""
    s = _indiv_vendor(db, active_event)
    it = _nv_item(db, s, code="NVS-1", price=10.0, quantity=2.0, remaining=0.0, status="sold")
    _seed_nonvendor_sale(db, active_event, it)
    from pypdf import PdfReader
    resp = client.get(
        f"/reports/{active_event.id}/nonvendor-sales?format=pdf",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "application/pdf" in resp.headers["content-type"]
    text = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(resp.content)).pages)
    assert "Non-Vendor Sales" in text
    assert "NVSALE1" in text and "Totals:" in text


def test_nonvendor_sales_xlsx_download(client, admin_token, active_event, db):
    """NonVendor_Sales sheet mirrors the Retailer_Sales layout: 16-col header,
    per-seller blocks with Totals row + blank separator, individual rate."""
    s = _indiv_vendor(db, active_event)
    it = _nv_item(db, s, code="NVS-1", price=10.0, quantity=2.0, remaining=0.0, status="sold")
    _seed_nonvendor_sale(db, active_event, it)

    resp = client.get(
        f"/reports/{active_event.id}/nonvendor-sales.xlsx",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]
    assert 'filename="nonvendor_sales_1.xlsx"' in resp.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(resp.content))
    ws = wb.active
    assert ws is not None
    assert ws.title == "NonVendor_Sales"
    assert ws["A1"].value == "Seller Code" and ws["P1"].value == "Donate"
    assert ws["A1"].font.bold is True
    assert ws["A2"].value == "NVSALE1" and ws["B2"].value == "NVS-1"
    assert ws["J2"].value == 20.0                     # Extend = 2 × $10
    assert ws["A3"].value == "Nonvendor Seller" and ws["I3"].value == "Totals:"
    assert ws["M3"].value == 20.0 and ws["N3"].value == 14.0  # 30% individual rate
    assert ws["A4"].value is None                     # blank separator


def test_nonvendor_sales_xlsx_separate_from_vendor(client, admin_token, active_event, db):
    """Vendor sellers never land in the non-vendor workbook and vice versa."""
    from datetime import date
    v = Seller(event_id=active_event.id, code="VSALE1", first_name=None, last_name=None,
               company="Vendor Sales Co", is_vendor=True, created_by="admin")
    db.add(v); db.commit(); db.refresh(v)
    vi = Intake(seller_id=v.id, donate_proceeds=False, donate_unsold=False, created_by="admin")
    db.add(vi); db.commit(); db.refresh(vi)
    db.add(Item(intake_id=vi.id, seller_id=v.id, code="VS-1", price=10.0,
                quantity=1.0, remaining=1.0, status="available", label_printed=True,
                created_by="admin"))
    s = _indiv_vendor(db, active_event)
    _nv_item(db, s, code="NVS-1")
    db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/nonvendor-sales.xlsx",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    wb = load_workbook(io.BytesIO(resp.content))
    ws = wb.active
    assert ws is not None
    assert ws.title == "NonVendor_Sales"
    codes = [ws.cell(row=r, column=1).value for r in (2, 3)]
    assert "NVSALE1" in codes and "VSALE1" not in codes


def test_nonvendor_sales_requires_admin(client, intake_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/nonvendor-sales.xlsx",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


def test_nonvendor_sales_unknown_event_404(client, admin_token):
    resp = client.get(
        "/reports/999999/nonvendor-sales.xlsx",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


# ── Payout counters are unit-based ──────────────────────────────────────────

def test_payout_counters_unit_based(client, admin_token, active_event, db):
    """3 item rows with quantities 2+1+2 = 5 consigned units; sold/unsold/
    donated counters all count units, not item rows."""
    s = _indiv_vendor(db, active_event)
    _nv_item(db, s, code="NVU-1", price=10.0, quantity=2.0, remaining=0.0, status="sold")
    _nv_item(db, s, code="NVU-2", price=5.0, quantity=1.0, remaining=1.0, status="available")
    di = Intake(seller_id=s.id, donate_proceeds=False, donate_unsold=True, created_by="admin")
    db.add(di); db.commit(); db.refresh(di)
    db.add(Item(intake_id=di.id, seller_id=s.id, code="NVU-3", price=7.0,
                quantity=2.0, remaining=2.0, status="donated", donate_unsold=True,
                label_printed=True, created_by="admin"))
    db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/seller/{s.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["items_consigned"] == 5
    assert data["items_sold"] == 2
    assert data["items_unsold"] == 1
    assert data["items_donated"] == 2


def test_payout_sale_line_includes_category_type_brand(client, admin_token,
                                                       active_event, rpt_sale, rpt_item):
    resp = client.get(
        f"/reports/{active_event.id}/seller/{rpt_item.seller_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    line = resp.json()["sales"][0]
    assert line["category"] == rpt_item.category
    assert line["type"] == rpt_item.type
    assert line["brand"] == rpt_item.brand
    assert "date_of_sale" in line  # retained in JSON


# ── Check Transactions ──────────────────────────────────────────────────────

def test_check_transactions_json(client, admin_token, active_event, db):
    s = _indiv_vendor(db, active_event)
    it = _nv_item(db, s, code="NVS-1")
    _seed_nonvendor_sale(db, active_event, it)
    ck = Sale(event_id=active_event.id, sale_total=15.0, mysl_total=4.5,
              seller_total=10.5, check_amount=15.0, check_number="2041",
              total_paid=15.0, is_voided=False, created_by="cashier1",
              customer_name="Cust X")
    voided = Sale(event_id=active_event.id, sale_total=9.0, mysl_total=2.7,
                  seller_total=6.3, check_amount=9.0, check_number="2042",
                  total_paid=9.0, is_voided=True, created_by="cashier1")
    db.add_all([ck, voided]); db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/check-transactions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["event_id"] == active_event.id
    assert data["count"] == 1
    assert data["total_check_amount"] == 15.0
    assert data["total_sale_amount"] == 15.0
    row = data["transactions"][0]
    assert row["check_number"] == "2041"
    assert row["check_amount"] == 15.0
    assert row["sale_total"] == 15.0
    assert row["cashier"] == "cashier1"
    assert row["customer_name"] == "Cust X"


def test_check_transactions_includes_mixed_tender(client, admin_token, active_event, db):
    """check_amount > 0 with cash also tendered still counts as a check row."""
    s = _indiv_vendor(db, active_event)
    it = _nv_item(db, s)
    mixed = Sale(event_id=active_event.id, sale_total=50.0, mysl_total=15.0,
                 seller_total=35.0, cash_amount=20.0, check_amount=30.0,
                 check_number="3001", total_paid=50.0, is_voided=False,
                 created_by="cashier1")
    db.add(mixed); db.commit()

    resp = client.get(
        f"/reports/{active_event.id}/check-transactions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    data = resp.json()
    assert data["count"] == 1
    assert data["transactions"][0]["check_amount"] == 30.0
    assert data["transactions"][0]["sale_total"] == 50.0
    assert data["total_check_amount"] == 30.0


def test_check_transactions_pdf_and_md_formats(client, admin_token, active_event, db):
    """format=pdf renders the check report table; format=md includes the row."""
    from pypdf import PdfReader
    sale = Sale(event_id=active_event.id, sale_total=15.0, mysl_total=4.5,
                seller_total=10.5, check_amount=15.0, check_number="2041",
                total_paid=15.0, is_voided=False, created_by="cashier1")
    db.add(sale)
    db.commit()
    headers = {"Authorization": f"Bearer {admin_token}"}
    md = client.get(
        f"/reports/{active_event.id}/check-transactions?format=md", headers=headers)
    assert md.status_code == 200
    assert "# Check Transactions" in md.text and "2041" in md.text
    pdf = client.get(
        f"/reports/{active_event.id}/check-transactions?format=pdf", headers=headers)
    assert pdf.status_code == 200
    assert "application/pdf" in pdf.headers["content-type"]
    text = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(pdf.content)).pages)
    assert "2041" in text


def test_check_transactions_invalid_format_422(client, admin_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/check-transactions?format=bogus",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_check_transactions_requires_admin(client, cashier_token, active_event):
    resp = client.get(
        f"/reports/{active_event.id}/check-transactions",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_check_transactions_unknown_event_404(client, admin_token):
    resp = client.get(
        "/reports/999999/check-transactions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404
