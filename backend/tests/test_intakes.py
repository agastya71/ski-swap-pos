import datetime
import pytest
from app.models.intake import Intake
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


def test_create_intake(client, admin_token, seller):
    resp = client.post(
        "/intakes",
        json={"seller_id": seller.id, "donate_unsold": False, "donate_proceeds": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["seller_id"] == seller.id
    assert data["donate_unsold"] is False


def test_create_intake_unknown_seller_returns_404(client, admin_token):
    resp = client.post(
        "/intakes",
        json={"seller_id": 99999, "donate_unsold": False, "donate_proceeds": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_get_intake(client, admin_token, intake):
    resp = client.get(f"/intakes/{intake.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == intake.id
    assert data["seller_id"] == intake.seller_id


def test_get_intake_not_found(client, admin_token):
    resp = client.get("/intakes/99999", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


def test_update_intake_donation_flags(client, admin_token, intake):
    resp = client.patch(
        f"/intakes/{intake.id}",
        json={"donate_unsold": True, "donate_proceeds": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["donate_unsold"] is True
    assert data["donate_proceeds"] is True


def test_cashier_cannot_create_intake(client, cashier_token, seller):
    resp = client.post(
        "/intakes",
        json={"seller_id": seller.id, "donate_unsold": False, "donate_proceeds": False},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert resp.status_code == 403


def test_intake_user_can_create_intake(client, intake_token, seller):
    resp = client.post(
        "/intakes",
        json={"seller_id": seller.id, "donate_unsold": False, "donate_proceeds": False},
        headers={"Authorization": f"Bearer {intake_token}"},
    )
    assert resp.status_code == 201


def test_add_item_auto_assigns_code(client, active_event, admin_token):
    """POST /intakes/{id}/items auto-generates item code as {seller_code}-01."""
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    seller_code = seller_r.json()["code"]  # e.g. "001"
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    intake_id = intake_r.json()["id"]

    item_r = client.post(
        f"/intakes/{intake_id}/items",
        json={"description": "Ski boots", "price": 50.0},
        headers=headers,
    )
    assert item_r.status_code == 201
    assert item_r.json()["code"] == f"{seller_code}-01"


def test_add_two_items_increments_code(client, active_event, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    seller_r = client.post("/sellers", json={"first_name": "A", "last_name": "B"}, headers=headers)
    seller_code = seller_r.json()["code"]
    intake_r = client.post("/intakes", json={"seller_id": seller_r.json()["id"]}, headers=headers)
    intake_id = intake_r.json()["id"]

    client.post(f"/intakes/{intake_id}/items", json={"description": "Skis", "price": 80.0}, headers=headers)
    r2 = client.post(f"/intakes/{intake_id}/items", json={"description": "Boots", "price": 40.0}, headers=headers)
    assert r2.json()["code"] == f"{seller_code}-02"


def test_create_intake_no_active_event_returns_503(client, db):
    from app.models.event import Event
    from app.models.user import User
    from app.services.auth import create_access_token, hash_password

    # Create inactive event
    event = Event(name="Old Event", year=2025, commission_rate=0.30, is_active=False)
    db.add(event)
    db.commit()
    db.refresh(event)

    # Create user for this event
    user = User(
        event_id=event.id,
        username="adminx",
        password_hash=hash_password("pw"),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.username, user.role, event.id)
    resp = client.post(
        "/intakes",
        json={"seller_id": 1, "donate_unsold": False, "donate_proceeds": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 503
