from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_registry_db
from app.models.registry import RegistryUser
from app.services.auth import decode_access_token, session_is_valid, touch_session

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_registry_db),
) -> RegistryUser:
    """Resolve the caller from the REGISTRY (accounts are shared across events).

    Phase G: user accounts live in the registry database — one set of accounts
    works for every event; switching the active event never invalidates tokens.

    Login sessions (2026-11-15): tokens issued via /auth/login carry a ``sid``
    claim pointing at the caller's ``login_session`` row. If that row has been
    revoked (admin action) the token is rejected immediately. Tokens without
    ``sid`` (pre-sessions legacy) expire on time only, unchanged.
    """
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Session enforcement: a sid that is revoked or deleted kills the token.
    session_id = payload.get("sid")
    if session_id is not None:
        if not session_is_valid(db, int(session_id)):
            raise HTTPException(status_code=401, detail="Session revoked")

    user = db.get(RegistryUser, user_id)  # pk lookup, no query-string sink
    if not user or user.is_active is not True:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    if session_id is not None:
        touch_session(db, int(session_id))  # advisory last_seen (throttled, best-effort)
    return user


def require_roles(*roles: str):
    """Returns a FastAPI dependency that enforces role membership."""

    def dependency(user: RegistryUser = Depends(get_current_user)) -> RegistryUser:
        if user.role not in roles:
            raise HTTPException(
                status_code=403, detail=f"Requires role: {', '.join(roles)}"
            )
        return user

    return dependency