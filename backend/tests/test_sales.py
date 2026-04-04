import datetime
import pytest
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
        },
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["cash_amount"] == 10.00
    assert data["check_amount"] == 5.00
    assert data["cc_amount"] == 5.00
    assert data["check_number"] == "1234"
    assert data["total_paid"] == 20.00
    assert data["balance_due"] == 0.00


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
    db.query(Event).update({"is_active": False})
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
