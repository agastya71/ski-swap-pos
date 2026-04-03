# ── POST /users ───────────────────────────────────────────────────────────────

def test_create_user(client, admin_token, active_event):
    response = client.post(
        "/users",
        json={"username": "newcashier", "password": "pass123", "role": "cashier"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newcashier"
    assert data["role"] == "cashier"
    assert data["is_active"] is True
    assert data["event_id"] == active_event.id
    assert "password" not in data
    assert "password_hash" not in data


def test_create_user_all_roles(client, admin_token, active_event):
    for role in ("admin", "intake", "cashier"):
        response = client.post(
            "/users",
            json={"username": f"user_{role}", "password": "x", "role": role},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 201, f"failed for role {role}"
        assert response.json()["role"] == role


def test_create_user_invalid_role(client, admin_token, active_event):
    response = client.post(
        "/users",
        json={"username": "baduser", "password": "x", "role": "superadmin"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 422


def test_create_user_duplicate_username(client, admin_token, active_event, admin_user):
    # "admin" user already exists in this event (created by admin_user fixture)
    response = client.post(
        "/users",
        json={"username": "admin", "password": "different", "role": "cashier"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 409


def test_create_user_no_active_event(client, db):
    from app.models.event import Event
    from app.models.user import User
    from app.services.auth import create_access_token, hash_password

    inactive_event = Event(name="Old Swap", year=2020, commission_rate=0.30, is_active=False)
    db.add(inactive_event)
    db.commit()
    db.refresh(inactive_event)

    orphan_admin = User(
        event_id=inactive_event.id,
        username="orphan",
        password_hash=hash_password("x"),
        role="admin",
        is_active=True,
    )
    db.add(orphan_admin)
    db.commit()
    db.refresh(orphan_admin)

    token = create_access_token(
        orphan_admin.id, orphan_admin.username, orphan_admin.role, inactive_event.id
    )
    response = client.post(
        "/users",
        json={"username": "x", "password": "x", "role": "cashier"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 503


def test_create_user_requires_admin(client, cashier_token, active_event):
    response = client.post(
        "/users",
        json={"username": "x", "password": "x", "role": "cashier"},
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert response.status_code == 403


# ── GET /users ────────────────────────────────────────────────────────────────

def test_list_users(client, admin_token, active_event, admin_user, cashier_user):
    response = client.get("/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    usernames = {u["username"] for u in data}
    assert "admin" in usernames
    assert "cashier1" in usernames
    for u in data:
        assert "password" not in u
        assert "password_hash" not in u


def test_list_users_requires_admin(client, cashier_token):
    response = client.get("/users", headers={"Authorization": f"Bearer {cashier_token}"})
    assert response.status_code == 403


# ── PATCH /users/{id}/deactivate ──────────────────────────────────────────────

def test_deactivate_user(client, admin_token, cashier_user):
    response = client.patch(
        f"/users/{cashier_user.id}/deactivate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_deactivate_nonexistent_user(client, admin_token):
    response = client.patch(
        "/users/99999/deactivate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 404


def test_deactivate_user_requires_admin(client, cashier_token, admin_user):
    response = client.patch(
        f"/users/{admin_user.id}/deactivate",
        headers={"Authorization": f"Bearer {cashier_token}"},
    )
    assert response.status_code == 403


def test_deactivate_user_from_other_event_returns_404(client, admin_token, db):
    from app.models.event import Event
    from app.models.user import User
    from app.services.auth import hash_password

    # Create a user in a different (inactive) event
    other_event = Event(name="Old Swap", year=2019, commission_rate=0.30, is_active=False)
    db.add(other_event)
    db.commit()
    db.refresh(other_event)

    other_user = User(
        event_id=other_event.id,
        username="olduser",
        password_hash=hash_password("x"),
        role="cashier",
        is_active=True,
    )
    db.add(other_user)
    db.commit()
    db.refresh(other_user)

    # Admin of active event cannot deactivate user from inactive event
    response = client.patch(
        f"/users/{other_user.id}/deactivate",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 404
