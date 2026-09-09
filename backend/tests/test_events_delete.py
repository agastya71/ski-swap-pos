"""Tests for DELETE /events/{id} — cascade deletion of an inactive event."""

import pytest

from app.models.event import Event
from app.models.intake import Intake
from app.models.item import Item
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.seller import Seller
from app.models.user import User
from app.services.auth import create_access_token, hash_password


@pytest.fixture
def other_event(db):
    """An inactive, deletable event distinct from the admin's active event."""
    event = Event(name="Old Swap 2025", year=2025, commission_rate=0.30, is_active=False)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@pytest.fixture
def other_event_data(db, other_event):
    """Populate other_event with one of every cascade-able record type."""
    seller = Seller(event_id=other_event.id, code="S25")
    db.add(seller)
    db.flush()
    intake = Intake(seller_id=seller.id)
    db.add(intake)
    db.flush()
    item = Item(intake_id=intake.id, seller_id=seller.id, code="ITM-25-1", price=10.0)
    db.add(item)
    sale = Sale(event_id=other_event.id)
    db.add(sale)
    db.flush()
    db.add(
        SaleItem(
            sale_id=sale.id,
            item_id=item.id,
            sell_price=10.0,
            extended_price=10.0,
        )
    )
    db.add(
        User(
            event_id=other_event.id,
            username="oldadmin",
            password_hash=hash_password("pw"),
            role="admin",
            is_active=True,
        )
    )
    db.commit()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_delete_inactive_event_cascades_all_records(
    client, db, admin_token, active_event, other_event, other_event_data
):
    resp = client.delete(f"/events/{other_event.id}", headers=_auth(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == other_event.id
    assert body["name"] == "Old Swap 2025"
    assert body["deleted"] == {
        "sale_items": 1,
        "sales": 1,
        "items": 1,
        "intakes": 1,
        "sellers": 1,
        "users": 1,
    }

    # Everything belonging to the deleted event is gone.
    assert db.query(Event).filter(Event.id == other_event.id).first() is None
    assert db.query(SaleItem).all() == []
    assert db.query(Sale).filter(Sale.event_id == other_event.id).first() is None
    assert db.query(Item).all() == []
    assert db.query(Intake).all() == []
    assert db.query(Seller).filter(Seller.event_id == other_event.id).first() is None
    assert db.query(User).filter(User.event_id == other_event.id).first() is None

    # The admin's active event (and its data) is untouched.
    assert db.query(Event).filter(Event.id == active_event.id).first() is not None


def test_delete_active_event_blocked(client, admin_token, active_event):
    resp = client.delete(f"/events/{active_event.id}", headers=_auth(admin_token))
    assert resp.status_code == 400
    assert "active" in resp.json()["detail"].lower()


def test_delete_own_event_blocked(client, db, other_event):
    """An admin cannot delete the event they belong to (would delete their own account)."""
    user = User(
        event_id=other_event.id,
        username="oldadmin",
        password_hash=hash_password("pw"),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    # Plain values: create_access_token takes ints/strs, not Column proxies.
    user_id = (
        db.query(User.id)
        .filter(User.username == "oldadmin", User.event_id == other_event.id)
        .scalar()
    )
    token = create_access_token(user_id, "oldadmin", "admin", other_event.id)

    resp = client.delete(f"/events/{other_event.id}", headers=_auth(token))
    assert resp.status_code == 400
    assert "logged into" in resp.json()["detail"].lower()
    assert db.query(Event).filter(Event.id == other_event.id).first() is not None


def test_delete_missing_event_returns_404(client, admin_token):
    resp = client.delete("/events/9999", headers=_auth(admin_token))
    assert resp.status_code == 404


def test_delete_requires_admin_role(client, cashier_token, other_event):
    resp = client.delete(f"/events/{other_event.id}", headers=_auth(cashier_token))
    assert resp.status_code == 403


def test_delete_unauthenticated(client, other_event):
    resp = client.delete(f"/events/{other_event.id}")
    assert resp.status_code == 403