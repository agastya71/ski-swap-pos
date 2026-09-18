from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_registry_db
from app.models.registry import RegistryUser
from app.services.auth import decode_access_token

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_registry_db),
) -> RegistryUser:
    """Resolve the caller from the REGISTRY (accounts are shared across events).

    Phase G: user accounts live in the registry database — one set of accounts
    works for every event; switching the active event never invalidates tokens.
    """
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = (
        db.query(RegistryUser)
        .filter(RegistryUser.id == user_id, RegistryUser.is_active == True)  # pi-lens-ignore: python-sql-injection  (ORM parameterized filter — the sink rule misfires on the == comparison)
        .first()
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
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