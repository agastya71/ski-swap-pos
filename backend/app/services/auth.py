"""Authentication service for password hashing and JWT token management.

Provides utilities for hashing and verifying bcrypt passwords, validating
password complexity, and creating/decoding signed JWT access tokens used by
the FastAPI dependency-injection auth layer.
"""

import re
import secrets
import string
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_PASSWORD_MIN_LENGTH = 8
_UPPERCASE_RE = re.compile(r"[A-Z]")
_LOWERCASE_RE = re.compile(r"[a-z]")
_DIGIT_RE = re.compile(r"\d")
_SPECIAL_RE = re.compile(r"[^A-Za-z0-9]")


def validate_password(password: str) -> str:
    """Validate password complexity; return the password if it passes.

    Requirements: at least 8 characters, with at least one uppercase letter,
    one lowercase letter, one digit, and one special (non-alphanumeric)
    character. Raises ``ValueError`` with a specific message on failure —
    callers surface this as a 422.
    """
    if not isinstance(password, str) or len(password) < _PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {_PASSWORD_MIN_LENGTH} characters long")
    if not _UPPERCASE_RE.search(password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not _LOWERCASE_RE.search(password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not _DIGIT_RE.search(password):
        raise ValueError("Password must contain at least one digit")
    if not _SPECIAL_RE.search(password):
        raise ValueError("Password must contain at least one special character")
    return password


# Character pools for generate_password. Specials avoid ambiguous characters
# (quotes, backslash, brackets) that break copy/paste or shell entry.
_GEN_UPPER = string.ascii_uppercase
_GEN_LOWER = string.ascii_lowercase
_GEN_DIGITS = string.digits
_GEN_SPECIALS = "!@#$%^&*-_=+?"
_GEN_POOL = _GEN_UPPER + _GEN_LOWER + _GEN_DIGITS + _GEN_SPECIALS


def generate_password(length: int = 12) -> str:
    """Generate a random password guaranteed to satisfy ``validate_password``.

    Guarantees at least one uppercase letter, one lowercase letter, one digit,
    and one special character, then fills the remainder from the full pool and
    shuffles. Uses :mod:`secrets` for cryptographic randomness. The result is
    re-checked against ``validate_password`` before returning.

    Args:
        length: Desired length (clamped to the minimum policy length).

    Returns:
        A plaintext password that passes the complexity policy.
    """
    if length < _PASSWORD_MIN_LENGTH:
        length = _PASSWORD_MIN_LENGTH
    rng = secrets.SystemRandom()
    for _ in range(32):
        chars = [
            secrets.choice(_GEN_UPPER),
            secrets.choice(_GEN_LOWER),
            secrets.choice(_GEN_DIGITS),
            secrets.choice(_GEN_SPECIALS),
        ] + [secrets.choice(_GEN_POOL) for _ in range(length - 4)]
        rng.shuffle(chars)
        pw = "".join(chars)
        # Always true given the guaranteed classes, but guard regardless.
        try:
            return validate_password(pw)
        except ValueError:
            continue
    raise RuntimeError("Failed to generate a compliant password")


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
