"""Tests for DELETE /events/{id} — Phase G registry semantics.

An event's data lives in its own database file, so deleting an INACTIVE event
removes the registry row and that event's database file (no cross-table
cascade). Guards: the ACTIVE event cannot be deleted; the old
caller-own-event lockout guard is obsolete (accounts are shared, not stored
in event databases).
"""

from pathlib import Path

import pytest

from app.models.registry import RegistryEvent, RegistryUser
from app.services.auth import create_access_token, hash_password


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_event(registry_db):
    """An inactive, deletable registry event distinct from the active event."""
    event = RegistryEvent(
        name="Old Swap 2025",
        year=2025,
        commission_rate=0.30,
        vendor_commission_rate=0.30,
        is_active=False,
        db_filename="old_swap_2025.db",
    )
    registry_db.add(event)
    registry_db.commit()
    registry_db.refresh(event)
    return event


def test_delete_inactive_event_removes_registry_row_and_file(
    client, registry_db, admin_token, active_event, other_event
):
    # The event's database file exists (as it would after a real event).
    import app.config as config
    from pathlib import Path

    db_file = Path(config.EVENTS_DIR) / str(other_event.db_filename)
    db_file.write_bytes(b"stub")  # content is irrelevant; DELETE must remove it

    resp = client.delete(f"/events/{other_event.id}", headers=_auth(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] == other_event.id
    assert body["name"] == "Old Swap 2025"
    assert body["db_filename"] == "old_swap_2025.db"

    # The registry row and the database file are gone.
    # pi-lens-ignore: python-sql-injection
    assert registry_db.query(RegistryEvent).filter(RegistryEvent.id == other_event.id).first() is None
    assert not db_file.exists()

    # The admin's active event is untouched.
    # pi-lens-ignore: python-sql-injection
    assert registry_db.query(RegistryEvent).filter(RegistryEvent.id == active_event.id).first() is not None


def test_delete_active_event_blocked(client, admin_token, active_event):
    resp = client.delete(f"/events/{active_event.id}", headers=_auth(admin_token))
    assert resp.status_code == 400
    assert "active" in resp.json()["detail"].lower()


def test_delete_missing_event_returns_404(client, admin_token):
    resp = client.delete("/events/9999", headers=_auth(admin_token))
    assert resp.status_code == 404


def test_delete_requires_admin_role(client, cashier_token, other_event):
    resp = client.delete(f"/events/{other_event.id}", headers=_auth(cashier_token))
    assert resp.status_code == 403


def test_delete_unauthenticated(client, other_event):
    resp = client.delete(f"/events/{other_event.id}")
    assert resp.status_code == 403