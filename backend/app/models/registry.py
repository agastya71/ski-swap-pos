"""Models for the REGISTRY database — the catalogue shared across all events.

Phase G (2026-09-18): each event gets its own SQLite database file with the
same (data) schema; this registry holds the event catalogue (with the path of
each event's database file) and ALL user accounts. Accounts are shared across
events — switching the active event never requires a re-login. The registry
lives at ``backend/registry.db`` and is created via ``RegistryBase`` (plain
``metadata.create_all`` at first use; it is not part of the alembic-managed
event schema).
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String

from app.database import RegistryBase  # defined in app/database.py (Phase G)


class RegistryEvent(RegistryBase):
    """Catalogue row for one event + the filename of its dedicated database.

    The registry event id is mirrored as the ``event.id`` row inside that
    event's own database, so every ``event_id`` reference in the app (URLs,
    JWT claims, FK columns) keeps meaning after the switch.
    """

    __tablename__ = "event"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    commission_rate = Column(Float, nullable=False, default=0.30)
    vendor_commission_rate = Column(Float, nullable=False, default=0.30)
    is_active = Column(Boolean, nullable=False, default=False)
    db_filename = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class RegistryUser(RegistryBase):
    """One user account, valid across ALL events (shared registry).

    Usernames are globally unique (accounts are no longer event-scoped) and
    the role gates are identical to the pre-Phase-G roles: admin / intake /
    cashier / cashier_intake.
    """

    __tablename__ = "user"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin / intake / cashier / cashier_intake (combined)
    is_active = Column(Boolean, nullable=False, default=True)


class RegistrySession(RegistryBase):
    """One login session (2026-11-15): a row per successful /auth/login.

    The JWT embeds the row id as the ``sid`` claim; ``dependencies.get_current_user``
    checks the row on every request, so an admin REVOKED session (revoked_at set)
    invalidates that token immediately — no waiting for the 8-hour expiry.
    Tokens issued before this change carry no ``sid`` and keep working until they
    expire (backward compatible; they simply are not revocable).

    Stored in the REGISTRY (accounts are shared across events; sessions too).
    Rows older than 90 days are pruned at login time (see services/auth.py).
    """

    __tablename__ = "login_session"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)  # RegistryUser.id
    username = Column(String, nullable=False)  # denormalized: survives user deletion in the audit view
    role = Column(String, nullable=False)  # role at login time
    event_id = Column(Integer, nullable=False)  # active event at login time
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    last_seen_at = Column(DateTime, nullable=True)  # updated on authenticated requests (throttled)
    revoked_at = Column(DateTime, nullable=True, index=True)  # set ⇒ token rejected
    revoked_by = Column(String, nullable=True)  # username of the revoking admin (NULL = self/expiry cleanup)
    login_ip = Column(String, nullable=True)  # client IP at login
    user_agent = Column(String, nullable=True)  # client device hint at login, truncated
