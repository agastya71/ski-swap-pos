"""Authentication router — handles login and current-user introspection; accessible to all roles."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.event import Event
from app.models.user import User
from app.schemas.auth import LoginRequest, PasswordChange, TokenResponse
from app.services.auth import create_access_token, generate_password, hash_password, verify_password

# Precomputed dummy hash — ensures bcrypt runs even for unknown usernames
# (prevents timing oracle that would reveal valid usernames)
_DUMMY_HASH = hash_password("dummy-constant-time-placeholder")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate a user and return a signed JWT access token."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")

    user = (
        db.query(User)
        .filter(
            User.event_id == event.id,
            User.username == body.username,
            User.is_active == True,
        )
        .first()
    )
    password_ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user.id, user.username, user.role, user.event_id)
    return TokenResponse(access_token=token, role=user.role, event_id=user.event_id)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    """Return the identity and role of the currently authenticated user."""
    return {"id": user.id, "username": user.username, "role": user.role, "event_id": user.event_id}


@router.get("/generate-password")
def suggest_password(_user: User = Depends(get_current_user)):
    """Return a suggested password that satisfies the complexity policy.

    Used by the UI to prefill a compliant default when creating a user or
    resetting/changing a password. Available to any authenticated user.
    """
    return {"password": generate_password()}


@router.post("/change-password", status_code=200)
def change_password(
    body: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Let an authenticated user change their own password.

    Re-verifies the current password before accepting the new one. The new
    password is complexity-checked by the schema validator. Returns 200 on
    success; 401 if the old password is wrong.
    """
    if not verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if body.old_password == body.new_password:
        raise HTTPException(status_code=422, detail="New password must differ from the current password")
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}
