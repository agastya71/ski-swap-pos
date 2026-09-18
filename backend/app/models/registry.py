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