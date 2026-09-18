"""User management router — creates, lists, and deactivates accounts; requires admin role.

Phase G: user accounts live in the shared REGISTRY (valid across all events);
there is no per-event scoping anymore — usernames are globally unique, and
creating/listing users never depends on which event is active.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_registry_db
from app.dependencies import require_roles
from app.models.registry import RegistryUser
from app.schemas.user import PasswordReset, UserCreate, UserResponse
from app.services.auth import hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_registry_db),
    _admin: RegistryUser = Depends(require_roles("admin")),
):
    """Create a new user account (shared registry — valid across all events)."""
    existing = (
        db.query(RegistryUser).filter(RegistryUser.username == body.username).first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    user = RegistryUser(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_registry_db),
    _admin: RegistryUser = Depends(require_roles("admin")),
):
    """List all user accounts (shared registry, alphabetical)."""
    return db.query(RegistryUser).order_by(RegistryUser.username).all()


@router.patch("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_registry_db),
    _admin: RegistryUser = Depends(require_roles("admin")),
):
    """Deactivate a user account so they can no longer log in."""
    user = db.query(RegistryUser).filter(RegistryUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", status_code=200)
def reset_user_password(
    user_id: int,
    body: PasswordReset,
    db: Session = Depends(get_registry_db),
    _admin: RegistryUser = Depends(require_roles("admin")),
):
    """Admin resets another user's (or their own) password.

    The new password is complexity-checked by the schema validator. The admin
    does not need to know the user's current password. Returns 200 on success.
    """
    user = db.query(RegistryUser).filter(RegistryUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(body.new_password)  # pyright: ignore[reportAttributeAccessIssue]
    db.commit()
    return {"ok": True}