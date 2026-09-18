"""
"""
from app.models.registry import RegistryUser

# ── POST /events ──────────────────────────────────────────────────────────────

def test_create_event(client, admin_token):
    response = client.post(
        "/events",
        json={"name": "MYSL Swap 2027", "year": 2027, "commission_rate": 0.30},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "MYSL Swap 2027"
    assert data["year"] == 2027
    assert data["commission_rate"] == 0.30
    assert data["is_active"] is False
    assert "id" in data
    assert "created_at" in data


def test_create_event_default_commission(client, admin_token):
    response = client.post(
        "/events",
        json={"name": "MYSL Swap 2028", "year": 2028},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201
    assert response.json()["commission_rate"] == 0.30


def test_create_event_requires_admin(client, cashier_token):
    response = client.post(
        "/events",
        json={"name": "MYSL Swap 2027", "year": 2027},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert response.status_code == 403


def test_create_event_requires_auth(client):
    response = client.post("/events", json={"name": "MYSL Swap 2027", "year": 2027})
    assert response.status_code == 403


# ── GET /events ───────────────────────────────────────────────────────────────

def test_list_events(client, admin_token, active_event):
    response = client.get("/events", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == active_event.id
    assert data[0]["is_active"] is True


def test_list_events_requires_admin(client, intake_token):
    response = client.get("/events", headers={"Authorization": f"Bearer {intake_token}"})
    assert response.status_code == 403


# ── POST /events/{id}/activate ────────────────────────────────────────────────

def test_activate_event_deactivates_others(client, admin_token, active_event, registry_db):
    """Create a second event via the API, then activate it — the registry
    deactivates the old one and the data engine rebinds to the new DB."""
    create_resp = client.post(
        "/events",
        json={"name": "MYSL Swap 2027", "year": 2027, "commission_rate": 0.30},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_resp.status_code == 201
    new_event = create_resp.json()

    response = client.post(
        f"/events/{new_event['id']}/activate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_active"] is True
    assert data["id"] == new_event["id"]
    assert data["db_filename"].endswith(".db")

    # The previously active event is now inactive in the registry.
    registry_db.refresh(active_event)
    assert active_event.is_active is False


def test_activate_nonexistent_event(client, admin_token):
    response = client.post(
        "/events/99999/activate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 404


def test_activate_event_requires_admin(client, cashier_token, active_event):
    response = client.post(
        f"/events/{active_event.id}/activate",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert response.status_code == 403


# ── GET /events/active ────────────────────────────────────────────────────────

def test_get_active_event_any_authenticated_user(client, cashier_token, active_event):
    """Cashiers/intake staff can read the active event (needed to display it on
    checkout transactions and intake requests)."""
    response = client.get("/events/active", headers={"Authorization": f"Bearer {cashier_token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == active_event.id
    assert data["is_active"] is True
    assert data["name"] == "MYSL Swap 2026"


def test_get_active_event_intake_user(client, intake_token, active_event):
    response = client.get("/events/active", headers={"Authorization": f"Bearer {intake_token}"})
    assert response.status_code == 200
    assert response.json()["id"] == active_event.id


def test_get_active_event_none_configured(client, registry_db):
    """No ACTIVE event in the registry → 503 even if an inactive event exists."""
    from app.services.auth import create_access_token, hash_password

    admin = RegistryUser(
        username="dormant_admin",
        password_hash=hash_password("pw"),
        role="admin",
        is_active=True,
    )
    registry_db.add(admin)
    registry_db.commit()
    registry_db.refresh(admin)
    # Plain values: create_access_token takes ints/strs, not Column proxies.
    token = create_access_token(
        admin.id, admin.username, admin.role, 0  # pyright: ignore[reportArgumentType]
    )

    response = client.get("/events/active", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503
    assert "no active event" in response.json()["detail"].lower()


def test_get_active_event_requires_auth(client):
    response = client.get("/events/active")
    assert response.status_code == 403
