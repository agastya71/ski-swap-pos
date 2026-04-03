def test_require_roles_allows_matching_role(client, active_event, admin_user, admin_token):
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200


def test_cashier_can_reach_me_endpoint(client, active_event, cashier_user, cashier_token):
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {cashier_token}"})
    assert response.status_code == 200
    assert response.json()["role"] == "cashier"


def test_expired_token_returns_401(client, active_event, admin_user):
    from datetime import datetime, timedelta, timezone

    from jose import jwt

    from app.config import JWT_ALGORITHM, JWT_SECRET

    payload = {
        "sub": str(admin_user.id),
        "username": admin_user.username,
        "role": admin_user.role,
        "event_id": active_event.id,
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    expired_token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401


def test_token_for_deactivated_user_returns_401(client, active_event, db):
    from app.models.user import User
    from app.services.auth import create_access_token, hash_password

    user = User(
        event_id=active_event.id,
        username="willbedeleted",
        password_hash=hash_password("x"),
        role="cashier",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.username, user.role, active_event.id)

    user.is_active = False
    db.commit()

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
