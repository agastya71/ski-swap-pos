"""Login-session tests (2026-11-15): sid claim, revocation, self/admin routes.

Users authenticate through /auth/login with the seeded conftest users (admin,
cashier1, intake1 — password "<name>123" pattern per conftest fixtures).
"""


def login_token(client, username="admin", password="admin123"):
    resp = client.post("/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def first_session_id(client, token):
    rows = client.get("/auth/sessions/mine", headers=auth(token)).json()
    return rows[0]["id"], rows


# --- token carries sid; session row exists ---------------------------------


def test_login_creates_session_row(client, active_event, admin_user):
    token = login_token(client)
    rows = client.get("/auth/sessions/mine", headers=auth(token)).json()
    assert len(rows) == 1
    row = rows[0]
    assert row["username"] == "admin"
    assert row["role"] == "admin"
    assert row["event_id"] == active_event.id
    assert row["revoked_at"] is None
    assert row["login_ip"] == "testclient"  # TestClient default
    assert row["user_agent"]


def test_decode_token_contains_sid(client, active_event, admin_user):
    from app.services.auth import decode_access_token

    token = login_token(client)
    payload = decode_access_token(token)
    assert isinstance(payload.get("sid"), int)
    assert payload["sid"] > 0


# --- revocation enforcement ------------------------------------------------


def test_revoked_session_token_is_rejected(client, active_event, admin_user):
    token = login_token(client)
    session_id, _ = first_session_id(client, token)
    resp = client.post(f"/auth/sessions/mine/{session_id}/revoke", headers=auth(token))
    assert resp.status_code == 200

    # The token that held the session is now dead.
    me = client.get("/auth/me", headers=auth(token))
    assert me.status_code == 401
    assert me.json()["detail"] == "Session revoked"


def test_admin_revoke_kills_victim_token(client, active_event, admin_user, cashier_user):
    victim_token = login_token(client, "cashier1", "cashier123")
    session_id, _ = first_session_id(client, victim_token)

    admin_token = login_token(client)
    resp = client.post(f"/auth/sessions/{session_id}/revoke", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    assert client.get("/auth/me", headers=auth(victim_token)).status_code == 401


def test_admin_revoke_user_sessions_kills_all(client, active_event, admin_user, cashier_user):
    t1 = login_token(client, "cashier1", "cashier123")
    t2 = login_token(client, "cashier1", "cashier123")

    admin_token = login_token(client)
    from app.services.auth import decode_access_token

    victim_id = decode_access_token(t1)["sub"]
    resp = client.post(f"/auth/users/{victim_id}/revoke-sessions", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["revoked"] == 2

    assert client.get("/auth/me", headers=auth(t1)).status_code == 401
    assert client.get("/auth/me", headers=auth(t2)).status_code == 401


def test_revoked_session_survives_restart_simulation(client, active_event, admin_user):
    """Revocation lives in the DB — a token re-check after 'restart' still fails."""
    token = login_token(client)
    session_id, _ = first_session_id(client, token)
    client.post(f"/auth/sessions/mine/{session_id}/revoke", headers=auth(token))

    # Fresh login (like after a reboot) can see the revoked row persisted in DB.
    fresh_token = login_token(client)
    rows = client.get("/auth/sessions/mine", headers=auth(fresh_token)).json()
    old_rows = [r for r in rows if r["id"] == session_id]
    assert old_rows and old_rows[0]["revoked_at"] is not None

    # The revoked token itself stays dead across the 'restart'.
    dead = client.get("/auth/me", headers=auth(token))
    assert dead.status_code == 401


def test_revoke_unknown_session_returns_404(client, active_event, admin_user):
    token = login_token(client)
    resp = client.post("/auth/sessions/mine/999999/revoke", headers=auth(token))
    assert resp.status_code == 404


def test_revoke_already_revoked_is_idempotent_ok(client, active_event, admin_user, cashier_user):
    cashier_token = login_token(client, "cashier1", "cashier123")
    session_id, _ = first_session_id(client, cashier_token)
    assert client.post(f"/auth/sessions/mine/{session_id}/revoke", headers=auth(cashier_token)).status_code == 200

    # A SECOND revocation of the same (now-dead) session is still a 200 no-op.
    # The original token is itself dead by now (self-revoke!), so use a fresh
    # login — its own session is a different row and stays alive.
    admin_token = login_token(client)
    assert client.post(f"/auth/sessions/{session_id}/revoke", headers=auth(admin_token)).status_code == 200


def test_user_cannot_revoke_someone_elses_session(client, active_event, admin_user, cashier_user, intake_user):
    victim_token = login_token(client, "cashier1", "cashier123")
    victim_session_id, _ = first_session_id(client, victim_token)

    attacker_token = login_token(client, "intake1", "intake123")
    resp = client.post(
        f"/auth/sessions/mine/{victim_session_id}/revoke", headers=auth(attacker_token)
    )
    assert resp.status_code == 404  # filtered by owner — looks like "not found"
    # Victim's session untouched.
    assert client.get("/auth/me", headers=auth(victim_token)).status_code == 200


# --- route guards & shape --------------------------------------------------


def test_admin_list_sessions_sees_other_users(client, active_event, admin_user, cashier_user):
    login_token(client, "cashier1", "cashier123")
    admin_token = login_token(client)
    rows = client.get("/auth/sessions", headers=auth(admin_token)).json()
    usernames = {r["username"] for r in rows}
    assert {"admin", "cashier1"} <= usernames


def test_sessions_list_requires_admin(client, active_event, admin_user, cashier_user):
    cashier_token = login_token(client, "cashier1", "cashier123")
    assert client.get("/auth/sessions", headers=auth(cashier_token)).status_code == 403
    assert client.get("/auth/sessions", headers=auth(cashier_token)).json()["detail"] == "Requires role: admin"


def test_admin_revoke_route_requires_admin(client, active_event, admin_user, cashier_user):
    cashier_token = login_token(client, "cashier1", "cashier123")
    resp = client.post("/auth/sessions/1/revoke", headers=auth(cashier_token))
    assert resp.status_code == 403


def test_admin_revoke_user_sessions_requires_admin(client, active_event, admin_user, cashier_user):
    cashier_token = login_token(client, "cashier1", "cashier123")
    resp = client.post("/auth/users/1/revoke-sessions", headers=auth(cashier_token))
    assert resp.status_code == 403


def test_sessions_routes_require_auth(client, active_event, admin_user):
    assert client.get("/auth/sessions").status_code == 403
    assert client.get("/auth/sessions/mine").status_code == 403
    assert client.post("/auth/sessions/1/revoke").status_code == 403
    assert client.post("/auth/sessions/mine/1/revoke").status_code == 403
    assert client.post("/auth/users/1/revoke-sessions").status_code == 403


def test_no_auth_event_503_still_before_session(client):
    # No event at all → 503 before any session row is written.
    resp = client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 503


# --- prune ------------------------------------------------------------------


def test_prune_drops_sessions_older_than_90_days(client, active_event, admin_user, registry_db):
    from datetime import datetime, timedelta, timezone

    from app.models.registry import RegistrySession

    old = RegistrySession(
        user_id=admin_user.id,
        username="admin",
        role="admin",
        event_id=active_event.id,
        created_at=datetime.now(timezone.utc) - timedelta(days=91),
    )
    fresh = RegistrySession(
        user_id=admin_user.id,
        username="admin",
        role="admin",
        event_id=active_event.id,
    )
    registry_db.add_all([old, fresh])
    registry_db.commit()
    old_id, fresh_id = old.id, fresh.id  # plain ints — instances die in the prune

    login_token(client)  # any login triggers the 90-day prune

    # Column-level re-query (tuples, no identity-map refresh): the prune deleted
    # the `old` row inside this same registry session, so touching the expired
    # ORM instance would raise ObjectDeletedError.
    registry_db.expire_all()
    ids = {sid for (sid,) in registry_db.query(RegistrySession.id).all()}  # pi-lens-ignore: python-sql-injection  (ORM column query, no parameters; sink rule misfires)
    assert old_id not in ids, "91-day-old session must be pruned"
    assert fresh_id in ids, "fresh session survives"
