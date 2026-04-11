import datetime
import pytest
from app.models.intake import Intake
from app.models.item import Item
from app.models.seller import Seller


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
        date_entered=datetime.date.today(),
        donate_unsold=False,
        donate_proceeds=False,
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
        price=25.00,
        status="available",
        label_printed=False,
        created_by="admin",
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


def test_add_item_to_intake(client, admin_token, intake):
    resp = client.post(
        f"/intakes/{intake.id}/items",
        json={"price": 25.00, "description": "Ski boots size 8", "category": "boots"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["code"].endswith("-01")
    assert data["price"] == 25.00
    assert data["status"] == "available"
    assert data["label_printed"] is False


def test_get_item(client, admin_token, item):
    resp = client.get(f"/items/{item.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["code"] == "ABC-001"


def test_get_item_not_found(client, admin_token):
    resp = client.get("/items/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


def test_update_item(client, admin_token, item):
    resp = client.patch(
        f"/items/{item.id}",
        json={"price": 30.00, "description": "Updated desc"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["price"] == 30.00


def test_delete_item(client, admin_token, item):
    resp = client.delete(f"/items/{item.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 204


def test_delete_item_after_label_printed_returns_409(client, admin_token, db, item):
    item.label_printed = True
    db.commit()
    resp = client.delete(f"/items/{item.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 409


def test_delete_item_not_found(client, admin_token):
    resp = client.delete("/items/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


def test_get_intake_includes_items(client, admin_token, intake, item):
    resp = client.get(f"/intakes/{intake.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 1
    assert data["items"][0]["code"] == "ABC-001"


def test_cashier_cannot_add_item(client, cashier_token, intake):
    resp = client.post(
        f"/intakes/{intake.id}/items",
        json={"price": 5.00},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


# ── Lookup tests ──────────────────────────────────────────────────────────────

def test_lookup_item_by_code(client, cashier_token, active_event, item, seller):
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["code"] == item.code
    assert data["seller_code"] == seller.code
    assert data["status"] == "available"


def test_lookup_item_not_found(client, cashier_token, active_event):
    resp = client.get(
        "/items/lookup?code=DOESNOTEXIST",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 404


def test_lookup_sold_item_returns_200_with_status(client, db, cashier_token, active_event, item):
    item.status = "sold"
    db.commit()
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "sold"


def test_lookup_intake_role_forbidden(client, intake_token, active_event, item):
    resp = client.get(
        f"/items/lookup?code={item.code}",
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 403


def test_lookup_no_active_event(client, db, cashier_token):
    from app.models.event import Event
    db.query(Event).update({"is_active": False})
    db.commit()
    resp = client.get(
        "/items/lookup?code=ABC-001",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 503


# ── Search tests ──────────────────────────────────────────────────────────────

def test_search_items_by_description(client, active_event, admin_token):
    """GET /items/search?q= matches item description."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"description": "Atomic skis 160cm", "price": 120.0},
        headers=headers,
    )
    r = client.get("/items/search?q=atomic", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert "Atomic" in r.json()[0]["description"]


def test_search_items_by_brand(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(
        f"/intakes/{intake_r.json()['id']}/items",
        json={"brand": "Rossignol", "price": 80.0},
        headers=headers,
    )
    r = client.get("/items/search?q=rossig", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_search_items_by_seller_code(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    seller_code = seller_r.json()["code"]
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    client.post(f"/intakes/{intake_r.json()['id']}/items", json={"price": 30.0}, headers=headers)
    r = client.get(f"/items/search?q={seller_code}", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1
