# ── POST /users ───────────────────────────────────────────────────────────────

def test_create_user(client, admin_token, active_event):
    response = client.post(
        "/users",
        json={"username": "newcashier", "password": "Str0ng!pw", "role": "cashier"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newcashier"
    assert data["role"] == "cashier"
    assert data["is_active"] is True
    assert data["event_id"] is None  # Phase G: accounts are event-agnostic
    assert "password" not in data
    assert "password_hash" not in data


def test_create_user_all_roles(client, admin_token, active_event):
    for role in ("admin", "intake", "cashier", "cashier_intake"):
        response = client.post(
            "/users",
            json={"username": f"user_{role}", "password": "Str0ng!pw", "role": role},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 201, f"failed for role {role}"
        assert response.json()["role"] == role


def test_create_user_invalid_role(client, admin_token, active_event):
    response = client.post(
        "/users",
        json={"username": "baduser", "password": "Str0ng!pw", "role": "superadmin"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 422


def test_create_user_duplicate_username(client, admin_token, active_event, admin_user):
    # "admin" user already exists in this event (created by admin_user fixture)
    response = client.post(
        "/users",
        json={"username": "admin", "password": "Str0ng!pw", "role": "cashier"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 409


def test_create_user_works_without_active_event(client, registry_db):
    """Phase G: user accounts live in the registry and do NOT require an
    active event — an admin token whose event_id claim is 0 still works."""
    from app.models.registry import RegistryUser
    from app.services.auth import create_access_token, hash_password

    admin = RegistryUser(
        username="orphan",
        password_hash=hash_password("Str0ng!pw"),
        role="admin",
        is_active=True,
    )
    registry_db.add(admin)
    registry_db.commit()
    registry_db.refresh(admin)

    token = create_access_token(
        admin.id, admin.username, admin.role, 0  # no active event claim  # pyright: ignore[reportArgumentType]
    )
    response = client.post(
        "/users",
        json={"username": "x", "password": "Str0ng!pw", "role": "cashier"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    assert response.json()["username"] == "x"


def test_create_user_requires_admin(client, cashier_token, active_event):
    response = client.post(
        "/users",
        json={"username": "x", "password": "Str0ng!pw", "role": "cashier"},
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


def test_create_user_weak_password_is_422(client, admin_token, active_event):
    for weak in ("short", "alllowercase1!", "NoDigits!!", "nouppercase1!", "SPECIALSNO"):
        r = client.post("/users", json={"username": "u", "password": weak, "role": "cashier"},
                        headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 422, f"expected 422 for {weak!r}, got {r.status_code}"


# ── change own password ───────────────────────────────────────────────────────

def test_change_password_succeeds_and_new_password_works(client, admin_user, admin_token, active_event):
    headers = {"Authorization": f"Bearer {admin_token}"}
    # admin_user fixture password is "admin123"
    r = client.post("/auth/change-password",
                    json={"old_password": "admin123", "new_password": "N3wStr0ng!pw"},
                    headers=headers)
    assert r.status_code == 200
    # Can login with the new password
    login = client.post("/auth/login", json={"username": "admin", "password": "N3wStr0ng!pw"})
    assert login.status_code == 200
    # Old password no longer works
    bad = client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert bad.status_code == 401


def test_change_password_wrong_old_is_401(client, admin_token):
    r = client.post("/auth/change-password",
                    json={"old_password": "wrong", "new_password": "N3wStr0ng!pw"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 401


def test_change_password_weak_new_is_422(client, admin_token):
    r = client.post("/auth/change-password",
                    json={"old_password": "admin123", "new_password": "weak"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422


def test_change_password_same_as_old_is_422(client, admin_token):
    r = client.post("/auth/change-password",
                    json={"old_password": "admin123", "new_password": "admin123"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422


def test_change_password_requires_auth(client):
    r = client.post("/auth/change-password",
                    json={"old_password": "x", "new_password": "N3wStr0ng!pw"})
    assert r.status_code == 403  # no bearer token (HTTPBearer returns 403 when no creds)


# ── admin reset password ──────────────────────────────────────────────────────

def test_admin_reset_password(client, admin_token, cashier_user):
    r = client.post(f"/users/{cashier_user.id}/reset-password",
                    json={"new_password": "R3set!Cashier"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    # cashier can now log in with the new password
    login = client.post("/auth/login", json={"username": "cashier1", "password": "R3set!Cashier"})
    assert login.status_code == 200


def test_admin_reset_password_weak_is_422(client, admin_token, cashier_user):
    r = client.post(f"/users/{cashier_user.id}/reset-password",
                    json={"new_password": "weak"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 422


def test_admin_reset_password_requires_admin(client, cashier_token, admin_user):
    r = client.post(f"/users/{admin_user.id}/reset-password",
                    json={"new_password": "R3set!Admin"},
                    headers={"Authorization": f"Bearer {cashier_token}"})
    assert r.status_code == 403


def test_admin_reset_password_unknown_user_404(client, admin_token):
    r = client.post("/users/99999/reset-password",
                    json={"new_password": "R3set!Someone"},
                    headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404


# ── DELETE /users/{id} (Phase G follow-up: remove accounts created in error) ──

def test_delete_user_succeeds(client, admin_token, active_event):
    """An admin can permanently delete an account; history is unaffected
    (created_by is a username string, not a FK)."""
    resp = client.post(
        "/users",
        json={"username": "mistake", "password": "Str0ng!pw", "role": "cashier"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    user_id = resp.json()["id"]

    resp = client.delete(f"/users/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["deleted"] == user_id
    assert body["username"] == "mistake"

    listing = client.get("/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert all(u["username"] != "mistake" for u in listing.json())


def test_delete_user_missing_returns_404(client, admin_token):
    resp = client.delete("/users/999999", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 404


def test_delete_self_blocked(client, admin_token):
    """An admin cannot delete their own account (lockout guard)."""
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"}).json()
    resp = client.delete(f"/users/{me['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 400
    assert "own" in resp.json()["detail"].lower()


def test_delete_last_active_admin_blocked(client, admin_token, active_event):
    """The only ACTIVE admin cannot be deleted; an INACTIVE admin can be."""
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"}).json()

    # A second admin exists but is deactivated -> the caller is the only
    # ACTIVE admin, so deleting the caller must be blocked.
    resp = client.post(
        "/users",
        json={"username": "temp_admin", "password": "Str0ng!pw", "role": "admin"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    temp_id = resp.json()["id"]
    client.patch(f"/users/{temp_id}/deactivate", headers={"Authorization": f"Bearer {admin_token}"})

    resp = client.delete(f"/users/{me['id']}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 400
    # The self-delete guard fires first (more specific than the last-admin guard).
    assert "own account" in resp.json()["detail"].lower()

    # The INACTIVE admin can still be deleted.
    resp = client.delete(f"/users/{temp_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200


def test_delete_user_requires_admin(client, cashier_token):
    resp = client.delete("/users/9999", headers={"Authorization": f"Bearer {cashier_token}"})
    assert resp.status_code == 403


def test_delete_non_admin_account_with_other_admins_ok(client, admin_token, active_event):
    """With multiple active admins, one admin CAN be deleted."""
    r1 = client.post("/users", json={"username": "admin_a", "password": "Str0ng!pw", "role": "admin"}, headers={"Authorization": f"Bearer {admin_token}"})
    r2 = client.post("/users", json={"username": "admin_b", "password": "Str0ng!pw", "role": "admin"}, headers={"Authorization": f"Bearer {admin_token}"})
    assert r1.status_code == 201 and r2.status_code == 201
    id_a = r1.json()["id"]

    resp = client.delete(f"/users/{id_a}", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
