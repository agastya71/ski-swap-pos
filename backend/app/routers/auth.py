"""Authentication router — handles login and current-user introspection; accessible to all roles."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_registry_db
from app.dependencies import get_current_user, require_roles
from app.models.registry import RegistryEvent, RegistrySession, RegistryUser
from app.schemas.auth import LoginRequest, PasswordChange, SessionInfo, TokenResponse
from app.services.auth import (
    create_access_token,
    create_login_session,
    generate_password,
    hash_password,
    revoke_all_for_user,
    revoke_session,
    verify_password,
)

# Precomputed dummy hash — ensures bcrypt runs even for unknown usernames
# (prevents timing oracle that would reveal valid usernames)
_DUMMY_HASH = hash_password("dummy-constant-time-placeholder")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_registry_db)):
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
        logger.warning("login FAILED user=%s ip=%s", body.username, request.client.host if request.client else "?")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Column attrs are runtime scalars (untyped Column declarations) — the
    # argument-type flags are static-analysis artifacts of that idiom.
    client_ip = request.client.host if request.client else None
    session_id = create_login_session(
        db, user, event.id, client_ip, request.headers.get("user-agent")  # pyright: ignore[reportArgumentType]
    )
    token = create_access_token(user.id, user.username, user.role, event.id, session_id)  # pyright: ignore[reportArgumentType]
    logger.info(
        "login OK user=%s role=%s ip=%s session=%s",
        body.username,
        user.role,
        client_ip if client_ip else "?",
        session_id,
    )
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

# ---------------------------------------------------------------------------
# Login sessions (2026-11-15) — every /auth/login creates a `login_session`
# row and embeds its id as the token's `sid` claim; get_current_user rejects
# tokens whose session row has been revoked. Routes are sorted so the
# parameterized `/{session_id}` paths never shadow the static ones.
# ---------------------------------------------------------------------------

def _session_to_info(s: RegistrySession) -> SessionInfo:
    """Map a login_session row to its API shape (username/role denormalized).

    from_attributes reads the ORM columns at runtime — avoids the 14-line
    Column[int]/int pyright-idiom suppression a field-by-field constructor
    would need (cerebrum idiom).
    """
    return SessionInfo.model_validate(s, from_attributes=True)


@router.get("/sessions/mine")
def my_sessions(
    current_user: RegistryUser = Depends(get_current_user),
    db: Session = Depends(get_registry_db),
):
    """List the current user's own login sessions (newest first)."""
    rows = (
        db.query(RegistrySession)
        .filter(RegistrySession.user_id == current_user.id)
        .order_by(RegistrySession.created_at.desc())
        .all()
    )
    return [_session_to_info(s) for s in rows]


@router.post("/sessions/mine/{session_id}/revoke")
def revoke_my_session(
    session_id: int,
    current_user: RegistryUser = Depends(get_current_user),
    db: Session = Depends(get_registry_db),
):
    """Let a user revoke one of their OWN sessions (e.g. sign out a device)."""
    if not revoke_session(
        db,
        session_id,
        revoked_by=current_user.username,  # pyright: ignore[reportArgumentType]  (Column idiom)
        user_id=current_user.id,  # pyright: ignore[reportArgumentType]  (Column idiom)
    ):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.get("/sessions")
def list_all_sessions(
    _admin: RegistryUser = Depends(require_roles("admin")),
    db: Session = Depends(get_registry_db),
):
    """List every user's login sessions (admin only, newest first)."""
    rows = db.query(RegistrySession).order_by(RegistrySession.created_at.desc()).all()
    return [_session_to_info(s) for s in rows]


@router.post("/sessions/{session_id}/revoke")
def admin_revoke_session(
    session_id: int,
    admin: RegistryUser = Depends(require_roles("admin")),
    db: Session = Depends(get_registry_db),
):
    """Revoke any session (admin only). The owning token dies within one request.
	"""
    if not revoke_session(db, session_id, revoked_by=admin.username):  # pyright: ignore[reportArgumentType]  (Column idiom)
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/users/{user_id}/revoke-sessions")
def admin_revoke_user_sessions(
    user_id: int,
    admin: RegistryUser = Depends(require_roles("admin")),
    db: Session = Depends(get_registry_db),
):
    """Revoke ALL live sessions for one user (admin only; e.g. offboarding)."""
    count = revoke_all_for_user(db, user_id, revoked_by=admin.username)  # pyright: ignore[reportArgumentType]  (Column idiom)
    return {"ok": True, "revoked": count}
