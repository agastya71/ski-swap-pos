"""Authentication service for password hashing and JWT token management.

Provides utilities for hashing and verifying bcrypt passwords and for
creating and decoding signed JWT access tokens used by the FastAPI
dependency-injection auth layer.
"""

from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt.

    Args:
        password: The plaintext password to hash.

    Returns:
        A bcrypt-hashed string suitable for storage.
    """
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash.

    Args:
        plain: The plaintext password supplied by the user.
        hashed: The bcrypt hash retrieved from the database.

    Returns:
        True if the password matches the hash, False otherwise.
    """
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, username: str, role: str, event_id: int) -> str:
    """Create a signed JWT access token for an authenticated user.

    The token embeds the user's ID, username, role, and active event ID.
    Expiry is controlled by the ``JWT_EXPIRE_MINUTES`` configuration value.

    Args:
        user_id: Primary key of the authenticated user.
        username: Login name embedded in the token payload.
        role: User role string (e.g. ``"admin"``, ``"cashier"``).
        event_id: ID of the event the user is currently operating under.

    Returns:
        A compact, URL-safe JWT string.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "event_id": event_id,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT access token.

    Args:
        token: A compact JWT string previously issued by ``create_access_token``.

    Returns:
        The decoded payload dictionary containing ``sub``, ``username``,
        ``role``, ``event_id``, and ``exp`` claims.

    Raises:
        jose.JWTError: If the token is invalid, expired, or the signature
            does not match.
    """
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
