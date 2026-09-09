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

def test_activate_event_deactivates_others(client, admin_token, active_event, db):
    from app.models.event import Event

    new_event = Event(name="MYSL Swap 2027", year=2027, commission_rate=0.30, is_active=False)
    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    response = client.post(
        f"/events/{new_event.id}/activate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_active"] is True
    assert data["id"] == new_event.id

    # Previously active event should now be inactive
    db.refresh(active_event)
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


def test_get_active_event_none_configured(client, db):
    """No ACTIVE event → 503 even if an inactive event exists (same contract as login)."""
    from app.models.event import Event
    from app.models.user import User
    from app.services.auth import create_access_token, hash_password

    event = Event(name="Dormant 2024", year=2024, is_active=False)
    db.add(event)
    db.flush()
    db.add(
        User(
            event_id=event.id,
            username="dormant_admin",
            password_hash=hash_password("pw"),
            role="admin",
            is_active=True,
        )
    )
    db.commit()
    # Plain values: create_access_token takes ints/strs, not Column proxies.
    user_id = db.query(User.id).filter(User.username == "dormant_admin").scalar()
    event_id = db.query(Event.id).filter(Event.name == "Dormant 2024").scalar()
    token = create_access_token(user_id, "dormant_admin", "admin", event_id)

    response = client.get("/events/active", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503
    assert "no active event" in response.json()["detail"].lower()


def test_get_active_event_requires_auth(client):
    response = client.get("/events/active")
    assert response.status_code == 403
