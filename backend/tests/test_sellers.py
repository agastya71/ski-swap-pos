import pytest
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


def test_create_seller(client, admin_token):
    resp = client.post(
        "/sellers",
        json={"code": "XYZ", "first_name": "Bob", "last_name": "Jones", "is_vendor": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["code"] == "XYZ"
    assert data["first_name"] == "Bob"
    assert data["event_id"] is not None


def test_create_seller_duplicate_code_returns_409(client, admin_token, seller):
    resp = client.post(
        "/sellers",
        json={"code": "ABC", "first_name": "Other", "last_name": "Person", "is_vendor": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 409


def test_list_sellers_no_filter(client, admin_token, seller):
    resp = client.get("/sellers", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_search_sellers_by_code(client, intake_token, seller):
    resp = client.get("/sellers?q=ABC", headers={"Authorization": f"Bearer {intake_token}"})
    assert resp.status_code == 200
    assert resp.json()[0]["code"] == "ABC"


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
    assert resp.json()["code"] == "ABC"


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
        json={"code": "ZZZ", "first_name": "A", "last_name": "B", "is_vendor": False},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403
