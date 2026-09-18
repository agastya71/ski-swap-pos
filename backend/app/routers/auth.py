"""Authentication router — handles login and current-user introspection; accessible to all roles."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_registry_db
from app.dependencies import get_current_user
from app.models.registry import RegistryEvent, RegistryUser
from app.schemas.auth import LoginRequest, PasswordChange, TokenResponse
from app.services.auth import create_access_token, generate_password, hash_password, verify_password

# Precomputed dummy hash — ensures bcrypt runs even for unknown usernames
# (prevents timing oracle that would reveal valid usernames)
_DUMMY_HASH = hash_password("dummy-constant-time-placeholder")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_registry_db)):
    """Authenticate a user and return a signed JWT access token.

    Phase G: accounts live in the shared REGISTRY (valid across all events);
    login still requires an active event (the POS is unusable without one) and
    the token's event_id claim records the active event at login time.
    """
    event = (
        db.query(RegistryEvent)
        .filter(RegistryEvent.is_active == True)  # noqa: E712  (SQLAlchemy idiom)
        .first()
    )
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")

    user = (
        db.query(RegistryUser)
        .filter(
            RegistryUser.username == body.username,
            RegistryUser.is_active == True,  # noqa: E712  (SQLAlchemy idiom)
        )
        .first()
    )
    password_ok = verify_password(
        body.password,
        user.password_hash if user else _DUMMY_HASH,  # pyright: ignore[reportArgumentType]
    )
    if not user or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Column attrs are runtime scalars (untyped Column declarations) — the
    # argument-type flags are static-analysis artifacts of that idiom.
    token = create_access_token(user.id, user.username, user.role, event.id)  # pyright: ignore[reportArgumentType]
    return TokenResponse(access_token=token, role=user.role, event_id=event.id)  # pyright: ignore[reportArgumentType]


@router.get("/me")
def me(user: RegistryUser = Depends(get_current_user), db: Session = Depends(get_registry_db)):
    """Return the identity and role of the currently authenticated user."""
    event = (
        db.query(RegistryEvent)
        .filter(RegistryEvent.is_active == True)  # noqa: E712  (SQLAlchemy idiom)
        .first()
    )
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "event_id": event.id if event else None,
    }


@router.get("/generate-password")
def suggest_password(_user: RegistryUser = Depends(get_current_user)):
    """Return a suggested password that satisfies the complexity policy.

    Used by the UI to prefill a compliant default when creating a user or
    resetting/changing a password. Available to any authenticated user.
    """
    return {"password": generate_password()}


@router.post("/change-password", status_code=200)
def change_password(
    body: PasswordChange,
    current_user: RegistryUser = Depends(get_current_user),
    db: Session = Depends(get_registry_db),
):
    """Let an authenticated user change their own password.

    Re-verifies the current password before accepting the new one. The new
    password is complexity-checked by the schema validator. Returns 200 on
    success; 401 if the old password is wrong.
    """
    if not verify_password(body.old_password, current_user.password_hash):  # pyright: ignore[reportArgumentType]
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if body.old_password == body.new_password:
        raise HTTPException(status_code=422, detail="New password must differ from the current password")
    current_user.password_hash = hash_password(body.new_password)  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    return {"ok": True}