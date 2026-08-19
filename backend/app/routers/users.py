"""User management router — creates, lists, and deactivates event users; requires admin role."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models.event import Event
from app.models.user import User
from app.schemas.user import PasswordReset, UserCreate, UserResponse
from app.services.auth import hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserResponse, status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    """Create a new user account for the active event."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")

    existing = (
        db.query(User)
        .filter(User.event_id == event.id, User.username == body.username)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists for this event")

    user = User(
        event_id=event.id,
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
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    """List all users belonging to the active event."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        return []
    return (
        db.query(User)
        .filter(User.event_id == event.id)
        .order_by(User.username)
        .all()
    )


@router.patch("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    """Deactivate a user account so they can no longer log in."""
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")

    user = db.query(User).filter(User.id == user_id, User.event_id == event.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", status_code=200)
def reset_user_password(
    user_id: int,
    body: PasswordReset,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    """Admin resets another user's (or their own) password.

    The new password is complexity-checked by the schema validator. The admin
    does not need to know the user's current password. Returns 200 on success.
    """
    event = db.query(Event).filter(Event.is_active == True).first()
    if not event:
        raise HTTPException(status_code=503, detail="No active event configured")
    user = db.query(User).filter(User.id == user_id, User.event_id == event.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}
