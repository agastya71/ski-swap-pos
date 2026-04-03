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
