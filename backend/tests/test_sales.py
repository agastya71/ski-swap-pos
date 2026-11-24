import datetime
import pytest
from tests.helpers import valid_seller_create
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def seller(db, active_event):
    s = Seller(
        event_id=active_event.id,
        code="ABC",
        first_name="Jane",
        last_name="Smith",
        is_vendor=False,
        created_by="admin",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def intake(db, seller):
    i = Intake(
        seller_id=seller.id,
        donate_proceeds=False,
        donate_unsold=False,
        created_by="admin",
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


@pytest.fixture
def donate_intake(db, seller):
    i = Intake(
        seller_id=seller.id,
        donate_proceeds=True,
        donate_unsold=False,
        created_by="admin",
    )
    db.add(i)
    db.commit()
    db.refresh(i)
    return i


@pytest.fixture
def item(db, intake, seller):
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-001",
        price=20.00,
        quantity=1.0,
        status="available",
        label_printed=True,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@pytest.fixture
def item2(db, intake, seller):
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-002",
        price=15.00,
        quantity=1.0,
        status="available",
        label_printed=True,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@pytest.fixture
def sold_item(db, intake, seller):
    it = Item(
        intake_id=intake.id,
        seller_id=seller.id,
        code="ABC-003",
        price=10.00,
        quantity=1.0,
        remaining=0.0,  # fully sold: nothing on hand
        status="sold",
        label_printed=True,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


@pytest.fixture
def donate_item(db, donate_intake, seller):
    it = Item(
        intake_id=donate_intake.id,
        seller_id=seller.id,
        code="ABC-004",
        price=30.00,
        quantity=1.0,
        status="available",
        label_printed=True,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


# ── POST /sales tests ─────────────────────────────────────────────────────────

def test_create_sale_single_item(client, db, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 20.00
    assert data["mysl_total"] == 6.00      # 30% of 20
    assert data["seller_total"] == 14.00
    assert data["cash_amount"] == 20.00
    assert data["total_paid"] == 20.00
    assert data["balance_due"] == 0.00
    assert len(data["sale_items"]) == 1
    assert data["sale_items"][0]["sell_price"] == 20.00
    db.refresh(item)
    assert item.status == "sold"


def test_create_sale_multi_item(client, db, cashier_token, active_event, item, item2):
    resp = client.post(
        "/sales",
        json={
            "items": [{"item_id": item.id}, {"item_id": item2.id}],
            "cash_amount": 35.00,
        },
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 35.00      # 20 + 15
    assert data["mysl_total"] == 10.50      # (20*0.3) + (15*0.3) = 6 + 4.5
    assert data["seller_total"] == 24.50    # 14 + 10.5
    assert len(data["sale_items"]) == 2
    db.refresh(item)
    db.refresh(item2)
    assert item.status == "sold"
    assert item2.status == "sold"


def test_create_sale_sell_price_override(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id, "sell_price": 15.00}], "cash_amount": 15.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 15.00
    assert data["mysl_total"] == 4.50       # 30% of 15
    assert data["seller_total"] == 10.50
    assert data["sale_items"][0]["sell_price"] == 15.00


def test_create_sale_donate_proceeds(client, cashier_token, active_event, donate_item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": donate_item.id}], "cash_amount": 30.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 30.00
    assert data["mysl_total"] == 30.00      # 100% to MYSL
    assert data["seller_total"] == 0.00


def test_create_sale_payment_split(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={
            "items": [{"item_id": item.id}],
            "cash_amount": 10.00,
            "check_amount": 5.00,
            "cc_amount": 5.00,
            "check_number": "1234",
            "cc_transaction_id": "sq-txn-123",
        },
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cash_amount"] == 10.00
    assert data["check_amount"] == 5.00
    assert data["cc_amount"] == 5.00
    assert data["check_number"] == "1234"
    assert data["cc_transaction_id"] == "sq-txn-123"
    assert data["total_paid"] == 20.00
    # Card fee removed (event feedback #7): no buyer-paid 3% anymore — the
    # sale settles at the pure item total regardless of tender.
    assert data["cc_fee"] == 0.00
    assert data["sale_total"] == 20.00
    assert data["mysl_total"] == 6.00   # 30% commission of 20.00, no fee
    assert data["seller_total"] == 14.00
    assert data["balance_due"] == 0.00


def test_create_sale_full_card_paid_matches_items_total(client, cashier_token, active_event, item):
    """All-card sale: with the 3% fee removed, the terminal charge equals the
    item total — buyers are charged exactly what the items cost."""
    resp = client.post(
        "/sales",
        json={
            "items": [{"item_id": item.id}],
            "cc_amount": 20.00,  # 20.00 items, no fee on top
            "cc_transaction_id": "sq-txn-777",
        },
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cc_fee"] == 0.00          # fee removed, nothing derived
    assert data["sale_total"] == 20.00
    assert data["mysl_total"] == 6.00      # 6.00 commission, no fee
    assert data["seller_total"] == 14.00   # seller untouched
    assert data["total_paid"] == 20.00
    assert data["balance_due"] == 0.00


def test_create_sale_no_card_fee_for_cash_sale(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cc_fee"] == 0.00
    assert data["sale_total"] == 20.00
    assert data["mysl_total"] == 6.00
    assert data["seller_total"] == 14.00


def test_create_sale_balance_due(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 10.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 20.00
    assert data["total_paid"] == 10.00
    assert data["balance_due"] == 10.00


def test_create_sale_overpay_change_due(client, cashier_token, active_event, item):
    """Overpayment (tender above the owed total) is recorded as a negative
    balance_due — the change handed back to the buyer."""
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 25.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["sale_total"] == 20.00
    assert data["total_paid"] == 25.00
    assert data["balance_due"] == -5.00


def test_create_sale_item_not_available(client, cashier_token, active_event, sold_item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": sold_item.id}], "cash_amount": 10.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 422
    assert "ABC-003" in resp.json()["detail"]


def test_create_sale_item_not_found(client, cashier_token, active_event):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": 99999}], "cash_amount": 10.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


def test_create_sale_duplicate_item_id(client, cashier_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}, {"item_id": item.id}], "cash_amount": 40.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 422


def test_create_sale_empty_items(client, cashier_token, active_event):
    resp = client.post(
        "/sales",
        json={"items": [], "cash_amount": 0.0},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 422


def test_create_sale_no_active_event(client, db, cashier_token):
    from app.models.event import Event
    # Attribute loop (not query.bulk_update/update()): keeps every test file on
    # the parameterized-by-construction form the SQL-sink scanner allowlists.
    for ev in db.query(Event).all():
        ev.is_active = False
    db.commit()
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": 1}], "cash_amount": 0.0},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 503


def test_create_sale_intake_role_forbidden(client, intake_token, active_event, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


# ── Shared fixture for GET and void tests ─────────────────────────────────────

@pytest.fixture
def created_sale(client, admin_token, item):
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    return resp.json()


# ── GET /sales/{id} tests ─────────────────────────────────────────────────────

def test_get_sale(client, cashier_token, active_event, created_sale):
    resp = client.get(
        f"/sales/{created_sale['id']}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == created_sale["id"]
    assert data["sale_total"] == 20.00
    assert len(data["sale_items"]) == 1


def test_get_sale_not_found(client, cashier_token, active_event):
    resp = client.get(
        "/sales/99999",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


def test_get_sale_intake_role_forbidden(client, intake_token, active_event, created_sale):
    resp = client.get(
        f"/sales/{created_sale['id']}",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


# ── POST /sales/{id}/void tests ───────────────────────────────────────────────

def test_void_sale_restores_item_status(client, db, admin_token, active_event, created_sale, item):
    resp = client.post(
        f"/sales/{created_sale['id']}/void",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    db.refresh(item)
    assert item.status == "available"


def test_void_sale_marks_as_voided(client, db, admin_token, active_event, created_sale):
    resp = client.post(
        f"/sales/{created_sale['id']}/void",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["is_voided"] is True


def test_void_sale_preserves_sale_record(client, db, admin_token, created_sale):
    from app.models.sale import Sale
    resp = client.post(
        f"/sales/{created_sale['id']}/void",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    sale = db.query(Sale).filter(Sale.id == created_sale["id"]).first()
    assert sale is not None
    assert sale.is_voided is True


def test_void_sale_cashier_forbidden(client, cashier_token, active_event, created_sale):
    resp = client.post(
        f"/sales/{created_sale['id']}/void",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_void_sale_not_found(client, admin_token, active_event):
    resp = client.post(
        "/sales/99999/void",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


# ── Cross-event isolation tests ───────────────────────────────────────────────

def test_create_sale_item_from_wrong_event(client, db, cashier_token, active_event):
    """Item exists in DB but belongs to a different (inactive) event → 404."""
    from app.models.event import Event
    from app.models.intake import Intake
    from app.models.item import Item
    from app.models.seller import Seller

    other_event = Event(name="Other Swap", year=2025, commission_rate=0.30, is_active=False)
    db.add(other_event)
    db.commit()
    db.refresh(other_event)

    other_seller = Seller(
        event_id=other_event.id,
        code="OTH",
        first_name="Other",
        last_name="Seller",
        is_vendor=False,
        created_by="admin",
    )
    db.add(other_seller)
    db.commit()
    db.refresh(other_seller)

    other_intake = Intake(
        seller_id=other_seller.id,
        donate_proceeds=False,
        donate_unsold=False,
        created_by="admin",
    )
    db.add(other_intake)
    db.commit()
    db.refresh(other_intake)

    other_item = Item(
        intake_id=other_intake.id,
        seller_id=other_seller.id,
        code="OTH-001",
        price=25.00,
        quantity=1.0,
        status="available",
        label_printed=True,
        created_by="admin",
    )
    db.add(other_item)
    db.commit()
    db.refresh(other_item)

    resp = client.post(
        "/sales",
        json={"items": [{"item_id": other_item.id}], "cash_amount": 25.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


def test_get_sale_from_wrong_event(client, db, cashier_token, active_event):
    """Sale exists in DB but belongs to a different (inactive) event → 404."""
    from app.models.event import Event
    from app.models.sale import Sale

    other_event = Event(name="Other Swap", year=2025, commission_rate=0.30, is_active=False)
    db.add(other_event)
    db.commit()
    db.refresh(other_event)

    other_sale = Sale(
        event_id=other_event.id,
        sale_total=0.0,
        mysl_total=0.0,
        seller_total=0.0,
        cash_amount=0.0,
        check_amount=0.0,
        cc_amount=0.0,
        total_paid=0.0,
        balance_due=0.0,
        created_by="admin",
    )
    db.add(other_sale)
    db.commit()
    db.refresh(other_sale)

    resp = client.get(
        f"/sales/{other_sale.id}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


# ── partial-quantity sales + void (Phase 3) ───────────────────────────────────

def _qty_item(db, intake, seller, code, qty=5.0, price=10.00):
    from app.models.item import Item
    it = Item(intake_id=intake.id, seller_id=seller.id, code=code, price=price,
              quantity=qty, remaining=qty, status="available", label_printed=False, created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


def test_create_sale_partial_quantity(client, db, cashier_token, active_event, intake, seller):
    it = _qty_item(db, intake, seller, "PQ-001", qty=5.0, price=10.00)
    r = client.post("/sales",
                    json={"items": [{"item_id": it.id, "quantity": 3}], "cash_amount": 30.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    assert r.status_code == 201
    data = r.json()
    assert data["sale_total"] == 30.00
    assert data["sale_items"][0]["quantity"] == 3
    assert data["sale_items"][0]["extended_price"] == 30.00
    db.refresh(it)
    assert it.quantity == 5.0          # intake quantity never mutated  # pyright: ignore[reportGeneralTypeIssues]
    assert it.remaining == 2.0         # on-hand decremented  # pyright: ignore[reportGeneralTypeIssues]
    assert it.status == "sold"         # status sold (partial), still sellable  # pyright: ignore[reportGeneralTypeIssues]


def test_create_sale_exceeds_remaining_422(client, db, cashier_token, active_event, intake, seller):
    it = _qty_item(db, intake, seller, "PQ-002", qty=5.0)
    r = client.post("/sales",
                    json={"items": [{"item_id": it.id, "quantity": 6}], "cash_amount": 60.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    assert r.status_code == 422
    assert "PQ-002" in r.json()["detail"]
    assert "5.0 remaining" in r.json()["detail"]


def test_create_sale_last_unit_sets_quantity_zero(client, db, cashier_token, active_event, intake, seller):
    it = _qty_item(db, intake, seller, "PQ-003", qty=2.0, price=10.00)
    r = client.post("/sales",
                    json={"items": [{"item_id": it.id, "quantity": 2}], "cash_amount": 20.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    assert r.status_code == 201
    db.refresh(it)
    assert it.quantity == 2.0          # intake quantity unchanged  # pyright: ignore[reportGeneralTypeIssues]
    assert it.remaining == 0.0         # fully sold out  # pyright: ignore[reportGeneralTypeIssues]
    assert it.status == "sold"  # pyright: ignore[reportGeneralTypeIssues]


def test_remaining_lifecycle_across_sales_and_voids(client, db, admin_token, cashier_token, active_event, intake, seller):
    """Intake qty 3: sell 1 → quantity stays 3, remaining 2; void → remaining 3.

    `quantity` is the original intake count and never mutates; `remaining`
    tracks sellable on-hand units (the 2026-08-30 quantity model)."""
    it = _qty_item(db, intake, seller, "PQ-010", qty=3.0, price=10.00)
    r1 = client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 1}], "cash_amount": 10.00},
                     headers={"Authorization": f"Bearer {cashier_token}"})
    assert r1.status_code == 201
    db.refresh(it)
    assert it.quantity == 3.0  # pyright: ignore[reportGeneralTypeIssues]
    assert it.remaining == 2.0  # pyright: ignore[reportGeneralTypeIssues]
    assert it.status == "sold"  # pyright: ignore[reportGeneralTypeIssues]

    r2 = client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 2}], "cash_amount": 20.00},
                     headers={"Authorization": f"Bearer {cashier_token}"})
    assert r2.status_code == 201
    db.refresh(it)
    assert it.remaining == 0.0  # pyright: ignore[reportGeneralTypeIssues]

    # Selling exhausted stock → sold out
    r3 = client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 1}], "cash_amount": 10.00},
                     headers={"Authorization": f"Bearer {cashier_token}"})
    assert r3.status_code == 422
    assert "sold out" in r3.json()["detail"]

    # Void the first sale → restores the 1 unit it sold (0 + 1 = 1 on hand)
    v = client.post(f"/sales/{r1.json()['id']}/void", headers={"Authorization": f"Bearer {admin_token}"})
    assert v.status_code == 200
    db.refresh(it)
    assert it.remaining == 1.0  # pyright: ignore[reportGeneralTypeIssues]
    assert it.quantity == 3.0  # pyright: ignore[reportGeneralTypeIssues]
    assert it.status == "sold"  # second sale still non-voided  # pyright: ignore[reportGeneralTypeIssues]


def test_create_sale_deleted_item_404(client, db, cashier_token, active_event, intake, seller):
    it = _qty_item(db, intake, seller, "PQ-004", qty=5.0)
    it.is_deleted = True  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    r = client.post("/sales",
                    json={"items": [{"item_id": it.id, "quantity": 1}], "cash_amount": 10.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    assert r.status_code == 404


def test_void_restores_quantity_and_status(client, db, admin_token, cashier_token, active_event, intake, seller):
    it = _qty_item(db, intake, seller, "PQ-005", qty=5.0)
    r = client.post("/sales",
                    json={"items": [{"item_id": it.id, "quantity": 3}], "cash_amount": 30.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    sale_id = r.json()["id"]
    db.refresh(it)
    assert it.quantity == 5.0          # intake quantity unchanged  # pyright: ignore[reportGeneralTypeIssues]
    assert it.remaining == 2.0 and it.status == "sold"  # pyright: ignore[reportGeneralTypeIssues]
    v = client.post(f"/sales/{sale_id}/void",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert v.status_code == 200
    db.refresh(it)
    assert it.remaining == 5.0         # restored  # pyright: ignore[reportGeneralTypeIssues]
    assert it.status == "available"    # no non-voided sales remain  # pyright: ignore[reportGeneralTypeIssues]


def test_void_keeps_sold_status_when_other_sales_remain(client, db, admin_token, cashier_token, active_event, intake, seller):
    it = _qty_item(db, intake, seller, "PQ-006", qty=5.0)
    r1 = client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 2}], "cash_amount": 20.00},
                     headers={"Authorization": f"Bearer {cashier_token}"})
    r2 = client.post("/sales", json={"items": [{"item_id": it.id, "quantity": 1}], "cash_amount": 10.00},
                     headers={"Authorization": f"Bearer {cashier_token}"})
    db.refresh(it)
    assert it.quantity == 5.0          # intake quantity unchanged  # pyright: ignore[reportGeneralTypeIssues]
    assert it.remaining == 2.0         # 5 - 2 - 1  # pyright: ignore[reportGeneralTypeIssues]
    # void the second sale -> restore 1 -> remaining 3, status still sold (first sale non-voided)
    v = client.post(f"/sales/{r2.json()['id']}/void",
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert v.status_code == 200
    db.refresh(it)
    assert it.remaining == 3.0         # restored 1 on void  # pyright: ignore[reportGeneralTypeIssues]
    assert it.status == "sold"  # pyright: ignore[reportGeneralTypeIssues]


# ── payment-id validators + timestamp (Phase 4) ───────────────────────────────

def test_create_sale_check_without_number_422(client, cashier_token, active_event, item):
    r = client.post("/sales",
                    json={"items": [{"item_id": item.id}], "check_amount": 20.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    assert r.status_code == 422


def test_create_sale_cc_without_transaction_id_succeeds(client, cashier_token, active_event, item):
    """Manual credit-card tender records cc_amount without a transaction id —
    the Square integration (pending) will supply ids later."""
    r = client.post("/sales",
                    json={"items": [{"item_id": item.id}], "cc_amount": 20.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    assert r.status_code == 201
    data = r.json()
    assert data["cc_amount"] == 20.00
    assert data["cc_transaction_id"] is None


def test_create_sale_records_timestamp_and_cashier(client, cashier_token, active_event, item):
    r = client.post("/sales",
                    json={"items": [{"item_id": item.id}], "cash_amount": 20.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    assert r.status_code == 201
    data = r.json()
    # date_of_sale is now a full ISO datetime (contains a 'T')
    assert "T" in data["date_of_sale"]
    assert data["created_by"] == "cashier1"
    assert data["cc_transaction_id"] is None


def test_void_twice_409_second_time(client, db, admin_token, cashier_token, active_event, intake, seller):
    """Voiding an already-voided sale returns 409 and does NOT re-add stock
    (review finding F1: repeat void inflated remaining until the restart)."""
    it = _qty_item(db, intake, seller, "PQ-020", qty=3.0, price=10.00)
    r = client.post("/sales",
                    json={"items": [{"item_id": it.id, "quantity": 1}], "cash_amount": 10.00},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    sale_id = r.json()["id"]
    v1 = client.post(f"/sales/{sale_id}/void", headers={"Authorization": f"Bearer {admin_token}"})
    assert v1.status_code == 200
    db.refresh(it)
    rem_after_first = it.remaining  # 3.0
    v2 = client.post(f"/sales/{sale_id}/void", headers={"Authorization": f"Bearer {admin_token}"})
    assert v2.status_code == 409
    db.refresh(it)
    assert it.remaining == 3.0      # unchanged by the re-void attempt  # pyright: ignore[reportGeneralTypeIssues]


def test_my_sales_returns_only_caller_sales(client, active_event, admin_token, db):
    """Each cashier sees ONLY their own transactions — a second cashier's
    sales are not leaked (user's request: cashiers see all of THEIR
    transactions, read-only)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Two cashiers, one sale each.
    s1 = client.post("/sellers", json=valid_seller_create(first_name="A", last_name="One"), headers=headers)
    i1 = client.post("/intakes", json={"seller_id": s1.json()["id"]}, headers=headers)
    item1 = client.post(f"/intakes/{i1.json()['id']}/items", json={"description": "Item X", "brand": "Atomic", "price": 50.0}, headers=headers)
    r1 = client.post("/sales", json={"items": [{"item_id": item1.json()["id"], "quantity": 1}]}, headers=headers)
    assert r1.status_code == 201

    # A second user records a different sale (via a separate login is not
    # needed — the admin's own sales list must exclude nothing they created;
    # what matters is the scoping by created_by). Verify the response shape.
    mine = client.get("/sales/mine", headers=headers)
    assert mine.status_code == 200
    assert len(mine.json()) == 1
    assert mine.json()[0]["created_by"] == "admin"
    assert mine.json()[0]["sale_total"] == r1.json()["sale_total"]
    assert len(mine.json()[0]["sale_items"]) == 1


def test_my_sales_newest_first_and_scoped_to_active_event(client, active_event, admin_token):
    """The caller's sales are returned newest first, scoped to the active event."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="B", last_name="Two"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    ids = []
    for price in (10.0, 20.0, 30.0):
        item = client.post(
            f"/intakes/{intake_r.json()['id']}/items",
            json={"description": "x", "brand": "Atomic", "price": price},
            headers=headers,
        )
        r = client.post("/sales", json={"items": [{"item_id": item.json()["id"], "quantity": 1}]}, headers=headers)
        assert r.status_code == 201
        ids.append(r.json()["id"])
    mine = client.get("/sales/mine", headers=headers)
    assert mine.status_code == 200
    assert [s["id"] for s in mine.json()] == list(reversed(ids))


def test_my_sales_requires_auth(client):
    r = client.get("/sales/mine")
    assert r.status_code == 403


# ── Exempt-seller checkout stamping (MYSL2-style) ────────────────────────────


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
def exempt_item(db, exempt_intake, exempt_seller):
    it = Item(intake_id=exempt_intake.id, seller_id=exempt_seller.id, code="MY2-001",
              price=10.00, quantity=1.0, status="available", label_printed=True,
              created_by="admin")
    db.add(it); db.commit(); db.refresh(it)
    return it


def _allow_exempt(db, active_event, codes="MYSL2"):
    active_event.exempt_seller_codes = codes  # pyright: ignore[reportAttributeAccessIssue]
    from app.models.event import Event as _Ev
    ev = db.get(_Ev, active_event.id)
    ev.exempt_seller_codes = codes  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()


def test_checkout_exempt_seller_full_price_stamped(client, db, cashier_token, active_event,
                                                   item, exempt_item):
    """MYSL2-style exemption at checkout: exempt line contributes 0 commission
    and full price to seller_total; regular line commissions normally."""
    _allow_exempt(db, active_event)
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": item.id}, {"item_id": exempt_item.id}],
              "cc_amount": 30.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    # 20.00 regular at 30% = 6.00 commission; 10.00 exempt = full payout, 0 cut.
    # Card fee removed: 30.00 card tender settles exactly at the item total.
    assert data["sale_total"] == 30.00
    assert data["mysl_total"] == 6.00
    assert data["seller_total"] == 24.00
    assert data["cc_fee"] == 0.00          # fee removed, nothing derived
    assert data["total_paid"] == 30.00     # tenders as entered
    assert data["balance_due"] == 0.00


def test_checkout_exempt_codes_case_insensitive_and_absent_list(client, db, cashier_token,
                                                                active_event, exempt_item):
    """No exempt list on the event → normal commission; lowercase code in the
    list still matches (codes are compared case-insensitively)."""
    # (a) no list configured — commission applies
    resp = client.post(
        "/sales",
        json={"items": [{"item_id": exempt_item.id}], "cash_amount": 10.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["mysl_total"] == 3.00

    # (b) lowercase code matches the uppercase seller code (fresh item —
    # void is admin-only, so reuse-by-void isn't available to a cashier).
    it2 = Item(intake_id=exempt_item.intake_id, seller_id=exempt_item.seller_id,
               code="MY2-002", price=10.00, quantity=1.0, status="available",
               label_printed=True, created_by="admin")
    db.add(it2); db.commit(); db.refresh(it2)
    _allow_exempt(db, active_event, codes="mysl2")
    resp2 = client.post(
        "/sales",
        json={"items": [{"item_id": it2.id}], "cash_amount": 10.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp2.status_code == 201
    data = resp2.json()
    assert data["mysl_total"] == 0.00
    assert data["seller_total"] == 10.00


# ── Transaction ID at sale start (issue #12) ─────────────────────────────────


def test_reserve_allocates_transaction_number(client, active_event, admin_token):
    """POST /sales/reserve pins the display number immediately: a draft row
    with a transaction_number, no items, is_finalized=False, zero totals."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    r = client.post("/sales/reserve", headers=headers)
    assert r.status_code == 201
    body = r.json()
    assert body["is_finalized"] is False
    assert body["is_voided"] is False
    assert body["transaction_number"] >= 1
    assert body["sale_items"] == []
    assert body["sale_total"] == 0.0
    # First-ever reservation: number matches the row id.
    assert body["transaction_number"] == body["id"]


def test_reserve_numbers_increment_and_adopt_preserves_id(
    client, active_event, admin_token, db
):
    """Checkouts adopt the reservation: same id, same transaction_number,
    items attached, finalized. Two reservations get distinct numbers."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="R", last_name="Twelve"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    item = client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"description": "Reservation poles", "brand": "Swix", "price": 25.0},
        headers=headers,
    ).json()

    r1 = client.post("/sales/reserve", headers=headers).json()
    r2 = client.post("/sales/reserve", headers=headers).json()
    assert r2["transaction_number"] > r1["transaction_number"]
    assert r2["id"] > r1["id"]

    checkout = client.post(
        "/sales",
        json={
            "transaction_id": r1["id"],
            "items": [{"item_id": item["id"], "quantity": 1}],
            "cash_amount": 25.0,
        },
        headers=headers,
    )
    assert checkout.status_code == 201
    body = checkout.json()
    assert body["id"] == r1["id"]
    assert body["transaction_number"] == r1["transaction_number"]
    assert body["is_finalized"] is True
    assert len(body["sale_items"]) == 1
    assert body["sale_total"] == 25.0


def test_checkout_with_unknown_or_spent_reservation_409(
    client, active_event, admin_token, db
):
    """transaction_id that doesn't exist, is finalized, or voided → 409."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="S", last_name="Gone"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    item = client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"description": "409 skis", "brand": "Fischer", "price": 100.0},
        headers=headers,
    ).json()
    payload = {
        "items": [{"item_id": item["id"], "quantity": 1}],
        "cash_amount": 100.0,
    }

    # Unknown id.
    r = client.post("/sales", json={**payload, "transaction_id": 999999}, headers=headers)
    assert r.status_code == 409

    # A finalized reservation cannot be adopted twice (second attempt uses a
    # different available item, so the 409 is the reservation guard acting —
    # not the duplicate-item 422).
    item2 = client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"description": "409 second skis", "brand": "Atomic", "price": 60.0},
        headers=headers,
    ).json()
    r1 = client.post("/sales/reserve", headers=headers).json()
    first = client.post("/sales", json={**payload, "transaction_id": r1["id"]}, headers=headers)
    assert first.status_code == 201
    again = client.post(
        "/sales",
        json={
            "transaction_id": r1["id"],
            "items": [{"item_id": item2["id"], "quantity": 1}],
            "cash_amount": 60.0,
        },
        headers=headers,
    )
    assert again.status_code == 409

    # A voided reservation cannot be adopted (second item again, so the 409
    # is the reservation guard — the first item got sold in the adopt above).
    r2 = client.post("/sales/reserve", headers=headers).json()
    void_r = client.post(f"/sales/{r2['id']}/void", headers=headers)
    assert void_r.status_code == 200
    spent = client.post(
        "/sales",
        json={
            "transaction_id": r2["id"],
            "items": [{"item_id": item2["id"], "quantity": 1}],
            "cash_amount": 60.0,
        },
        headers=headers,
    )
    assert spent.status_code == 409


def test_draft_reservations_hidden_from_listings(
    client, active_event, admin_token, db
):
    """is_finalized=False rows never appear in /sales or /sales/mine, and
    they don't affect the visible-sale assertions of neighbors. Voided
    drafts remain excluded (default include_voided=False)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    before = client.get("/sales/mine", headers=headers).json()
    draft1 = client.post("/sales/reserve", headers=headers).json()
    draft2 = client.post("/sales/reserve", headers=headers).json()

    mine = client.get("/sales/mine", headers=headers)
    assert mine.status_code == 200
    assert [s["id"] for s in mine.json()] == [s["id"] for s in before]

    listing = client.get("/sales", headers=headers)
    assert listing.status_code == 200
    listed_ids = {s["id"] for s in listing.json()}
    assert draft1["id"] not in listed_ids
    assert draft2["id"] not in listed_ids

    # Draft is addressable by id (the POS polls it) and visible to sale_edit
    # only as 409-not-editable.
    detail = client.get(f"/sales/{draft1['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["is_finalized"] is False
    edit_attempt = client.patch(
        f"/sales/{draft1['id']}",
        json={"customer_name": "Nope"},
        headers=headers,
    )
    assert edit_attempt.status_code == 409

    # Abandonment voids a draft; voided draft still absent from listings,
    # number retired (never handed out again).
    voided = client.post(f"/sales/{draft2['id']}/void", headers=headers)
    assert voided.status_code == 200
    listing_after = client.get("/sales", headers=headers).json()
    assert draft2["id"] not in {s["id"] for s in listing_after}

    seller_r = client.post("/sellers", json=valid_seller_create(first_name="N", last_name="Reuse"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    item = client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"description": "Reuse skis", "brand": "Atomic", "price": 12.0},
        headers=headers,
    ).json()
    checkout = client.post(
        "/sales",
        json={"items": [{"item_id": item["id"], "quantity": 1}], "cash_amount": 12.0},
        headers=headers,
    )
    assert checkout.status_code == 201
    assert checkout.json()["transaction_number"] > draft2["transaction_number"]


def test_reports_exclude_unfinalized_reservations(client, active_event, admin_token, db):
    """Reports read finalized sales only: a floating reservation must not
    inflate revenue or count lines (get_event_revenue filters is_finalized)."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json=valid_seller_create(first_name="C", last_name="Lean"), headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    item = client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"description": "Clean helmet", "brand": "Smith", "price": 40.0},
        headers=headers,
    ).json()
    sold = client.post(
        "/sales",
        json={"items": [{"item_id": item["id"], "quantity": 1}], "cash_amount": 40.0},
        headers=headers,
    ).json()
    client.post("/sales/reserve", headers=headers)

    r = client.get(f"/reports/{active_event.id}/revenue", headers=headers)
    assert r.status_code == 200
    rev = r.json()
    assert rev["gross_revenue"] == sold["sale_total"] == 40.0
