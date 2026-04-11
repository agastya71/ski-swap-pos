import pytest
from app.models.seller import Seller


@pytest.fixture
def seller(db, active_event):
    s = Seller(
        event_id=active_event.id,
        code="001",
        first_name="Jane",
        last_name="Smith",
        is_vendor=False,
        created_by="admin",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def test_create_seller(client, active_event, admin_token):
    resp = client.post(
        "/sellers",
        json={"first_name": "Bob", "last_name": "Jones", "is_vendor": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["code"]) == 3
    assert data["first_name"] == "Bob"
    assert data["event_id"] is not None


def test_list_sellers_no_filter(client, admin_token, seller):
    resp = client.get("/sellers", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_search_sellers_by_code(client, intake_token, seller):
    resp = client.get("/sellers?q=001", headers={"Authorization": f"Bearer {intake_token}"})
    assert resp.status_code == 200
    assert resp.json()[0]["code"] == "001"


def test_search_sellers_by_name(client, intake_token, seller):
    resp = client.get("/sellers?q=jane", headers={"Authorization": f"Bearer {intake_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_search_sellers_no_match(client, intake_token, seller):
    resp = client.get("/sellers?q=zzz", headers={"Authorization": f"Bearer {intake_token}"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_seller(client, admin_token, seller):
    resp = client.get(f"/sellers/{seller.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["code"] == "001"


def test_get_seller_not_found(client, admin_token):
    resp = client.get("/sellers/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


def test_update_seller(client, admin_token, seller):
    resp = client.patch(
        f"/sellers/{seller.id}",
        json={"email": "jane@example.com", "phone": "555-1234"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "jane@example.com"


def test_cashier_cannot_create_seller(client, cashier_token):
    resp = client.post(
        "/sellers",
        json={"first_name": "A", "last_name": "B", "is_vendor": False},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_create_seller_auto_assigns_code(client, active_event, admin_token):
    """POST /sellers assigns a sequential 3-digit code; client need not provide one."""
    r = client.post(
        "/sellers",
        json={"first_name": "Jane", "last_name": "Smith"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 201
    assert r.json()["code"] == "001"


def test_create_two_sellers_increments_code(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    r2 = client.post("/sellers", json={"first_name": "C", "last_name": "D"}, headers=headers)
    assert r2.json()["code"] == "002"


def test_list_seller_items_empty(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Create a seller first
    r = client.post("/sellers", json={"first_name": "X", "last_name": "Y"}, headers=headers)
    seller_id = r.json()["id"]
    r2 = client.get(f"/sellers/{seller_id}/items", headers=headers)
    assert r2.status_code == 200
    assert r2.json() == []
