def test_login_success(client, active_event, admin_user):
    response = client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "admin"
    assert data["event_id"] == active_event.id


def test_login_wrong_password(client, active_event, admin_user):
    response = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert response.status_code == 401
    assert "detail" in response.json()


def test_login_unknown_user(client, active_event):
    response = client.post("/auth/login", json={"username": "ghost", "password": "x"})
    assert response.status_code == 401


def test_login_inactive_user(client, active_event, db):
    from app.models.user import User
    from app.services.auth import hash_password

    user = User(
        event_id=active_event.id,
        username="deactivated",
        password_hash=hash_password("pass123"),
        role="cashier",
        is_active=False,
    )
    db.add(user)
    db.commit()

    response = client.post("/auth/login", json={"username": "deactivated", "password": "pass123"})
    assert response.status_code == 401


def test_login_no_active_event(client):
    # DB is empty — no event at all
    response = client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 503


def test_me_returns_current_user(client, active_event, admin_user, admin_token):
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"
    assert data["event_id"] == active_event.id


def test_me_no_token(client):
    response = client.get("/auth/me")
    assert response.status_code == 403


def test_me_invalid_token(client):
    response = client.get("/auth/me", headers={"Authorization": "Bearer bad.token.here"})
    assert response.status_code == 401
