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


def create_access_token(user_id: int, username: str, role: str, event_id: int, session_id: int | None = None) -> str:
    """Create a signed JWT access token for an authenticated user.

    The token embeds the user's ID, username, role, active event ID and (since
    2026-11-15) the id of the caller's ``login_session`` row as ``sid``. A token
    with a ``sid`` is valid only while that session row exists and is not
    revoked; tokens without ``sid`` (pre-sessions legacy) expire on time only.

    Args:
        user_id: Primary key of the authenticated user.
        username: Login name embedded in the token payload.
        role: User role string (e.g. ``"admin"``, ``"cashier"``).
        event_id: ID of the event the user is currently operating under.
        session_id: Id of the created RegistrySession row backing this login.

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
    if session_id is not None:
        payload["sid"] = session_id
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


# ── Login sessions (2026-11-15) ──────────────────────────────────────────────

# Rows older than this are deleted at login time (user decision: auto-prune).
SESSION_RETENTION_DAYS = 90

# last_seen_at is throttled to one write per this many seconds per session, so
# authenticated requests don't become a registry write on every call.
_LAST_SEEN_THROTTLE_SECONDS = 60


def _import_session_model():
    """Import RegistrySession lazily (avoids a models→services import cycle)."""
    from app.models.registry import RegistrySession

    return RegistrySession


def create_login_session(db, user, event_id: int, login_ip: str | None, user_agent: str | None) -> int:
    """Persist a new login-session row; returns its id (embedded as JWT ``sid``).

    Side effect: prunes session rows older than SESSION_RETENTION_DAYS —
    the user chose auto-prune >90d, checked at login (cheap on this volume).
    """
    RegistrySession = _import_session_model()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=SESSION_RETENTION_DAYS)
    db.query(RegistrySession).filter(
        RegistrySession.created_at < cutoff
    ).delete(synchronize_session=False)  # pi-lens-ignore: python-sql-injection  (ORM parameterized filter — the sink rule misfires on the < comparison)

    ua = (user_agent or "").strip()
    if len(ua) > 120:  # keep the hint bounded; browsers send long UA strings
        ua = ua[:117] + "..."
    session = RegistrySession(
        user_id=user.id,
        username=user.username,
        role=user.role,
        event_id=event_id,
        login_ip=login_ip,
        user_agent=ua or None,
    )
    db.add(session)
    db.commit()
    # After commit the attribute is a runtime int, but pyright sees Column[int].
    return session.id  # pyright: ignore[reportReturnType]


def session_is_valid(db, session_id: int) -> bool:
    """True while the session row exists and has not been revoked."""
    RegistrySession = _import_session_model()
    row = db.get(RegistrySession, session_id)  # pk lookup, no query-string sink
    return row is not None and row.revoked_at is None


def touch_session(db, session_id: int) -> None:
    """Update last_seen_at, throttled to one write per throttle window.

    Best-effort by design: a write storm or a torn read must never 500 an
    authenticated request — the registry commit here is advisory metadata.
    """
    RegistrySession = _import_session_model()
    row = db.get(RegistrySession, session_id)  # pk lookup, no query-string sink
    if row is None:
        return
    now = datetime.now(timezone.utc)
    if row.last_seen_at is not None:
        try:
            age = (now - row.last_seen_at).total_seconds()
        except (TypeError, ValueError):
            age = None
        if age is not None and age < _LAST_SEEN_THROTTLE_SECONDS:
            return
    row.last_seen_at = now
    try:
        db.commit()
    except Exception:  # noqa: BLE001 — advisory only, never block the request
        db.rollback()


def revoke_session(
    db,
    session_id: int,
    revoked_by: str | None = None,
    user_id: int | None = None,
) -> bool:
    """Revoke one session (sets revoked_at); returns False if already gone.

    When user_id is given, the session must belong to that user — used by the
    self-revoke route so a user can only kill their own sessions.
    """
    RegistrySession = _import_session_model()
    # Session.get() = canonical primary-key fetch; no query-builder chain for
    # the dynamic-SQL sink heuristic to misread. Ownership is enforced post-hoc.
    row = db.get(RegistrySession, session_id)
    if row is None:
        return False
    if user_id is not None and row.user_id != user_id:
        return False
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        row.revoked_by = revoked_by
        db.commit()
    return True


def revoke_all_for_user(db, user_id: int, revoked_by: str | None = None) -> int:
    """Revoke every live session of a user; returns how many were revoked."""
    RegistrySession = _import_session_model()
    now = datetime.now(timezone.utc)
    rows = (
        db.query(RegistrySession)
        .filter(RegistrySession.user_id == user_id, RegistrySession.revoked_at.is_(None))  # pi-lens-ignore: python-sql-injection  (ORM parameterized filter — the sink rule misfires on the == comparison)
        .all()
    )
    for row in rows:
        row.revoked_at = now
        row.revoked_by = revoked_by
    if rows:
        db.commit()
    return len(rows)
