import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, RegistryBase, get_db, get_registry_db
from app.main import app


@pytest.fixture(autouse=True)
def _tmp_events_dir(tmp_path, monkeypatch):
    """Point EVENTS_DIR at a per-test temp dir (API-created event DBs are real files)."""
    events_dir = tmp_path / "events"
    events_dir.mkdir()
    import app.config as config
    import app.database as database

    monkeypatch.setattr(config, "EVENTS_DIR", str(events_dir))
    monkeypatch.setattr(database, "EVENTS_DIR", str(events_dir))


@pytest.fixture(scope="function")
def db_engines():
    """One pair of in-memory engines per test: REGISTRY + EVENT data DB.

    Phase G: the app talks to TWO databases — the registry (event catalogue +
    shared user accounts) and the active event's data DB. Both dependencies
    are overridden in the `client` fixture below.
    """
    args = {"check_same_thread": False}
    reg_engine = create_engine(
        "sqlite:///:memory:", connect_args=args, poolclass=StaticPool
    )
    ev_engine = create_engine(
        "sqlite:///:memory:", connect_args=args, poolclass=StaticPool
    )
    RegistryBase.metadata.create_all(reg_engine)
    Base.metadata.create_all(ev_engine)
    yield reg_engine, ev_engine
    RegistryBase.metadata.drop_all(reg_engine)
    Base.metadata.drop_all(ev_engine)
    reg_engine.dispose()
    ev_engine.dispose()


@pytest.fixture(scope="function")
def registry_db(db_engines):
    """REGISTRY session (event catalogue + shared user accounts)."""
    reg_engine, _ = db_engines
    Session = sessionmaker(bind=reg_engine, autocommit=False, autoflush=False)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="function")
def db(db_engines):
    """EVENT-data session (sellers, intakes, items, sales — the active event)."""
    _, ev_engine = db_engines
    Session = sessionmaker(bind=ev_engine, autocommit=False, autoflush=False)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="function")
def client(db, registry_db):
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_registry_db] = lambda: registry_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── shared data fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def active_event(registry_db, db):
    """The active event, in BOTH databases (shared id — Phase G contract).

    The registry row is the catalogue entry (with db_filename); the event-DB
    row mirrors it (same id, is_active=True) so the data routers' standard
    "resolve the active event" queries keep working. The registry id is
    returned.
    """
    from app.models.event import Event
    from app.models.registry import RegistryEvent

    reg_event = RegistryEvent(
        name="MYSL Swap 2026",
        year=2026,
        commission_rate=0.30,
        vendor_commission_rate=0.30,
        is_active=True,
        db_filename="test_event.db",
    )
    registry_db.add(reg_event)
    registry_db.commit()
    registry_db.refresh(reg_event)

    ev_event = Event(
        id=reg_event.id,
        name="MYSL Swap 2026",
        year=2026,
        commission_rate=0.30,
        vendor_commission_rate=0.30,
        is_active=True,
    )
    db.add(ev_event)
    db.commit()
    db.refresh(ev_event)
    # str() coercions keep pyright clean on the Column-typed ids (cerebrum idiom).
    assert str(ev_event.id) == str(reg_event.id)
    return reg_event


@pytest.fixture
def admin_user(registry_db):
    from app.models.registry import RegistryUser
    from app.services.auth import hash_password

    user = RegistryUser(
        username="admin",
        password_hash=hash_password("admin123"),
        role="admin",
        is_active=True,
    )
    registry_db.add(user)
    registry_db.commit()
    registry_db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user, active_event):
    from app.services.auth import create_access_token

    return create_access_token(
        admin_user.id, admin_user.username, admin_user.role, active_event.id
    )


@pytest.fixture
def cashier_user(registry_db):
    from app.models.registry import RegistryUser
    from app.services.auth import hash_password

    user = RegistryUser(
        username="cashier1",
        password_hash=hash_password("cashier123"),
        role="cashier",
        is_active=True,
    )
    registry_db.add(user)
    registry_db.commit()
    registry_db.refresh(user)
    return user


@pytest.fixture
def cashier_token(cashier_user, active_event):
    from app.services.auth import create_access_token

    return create_access_token(
        cashier_user.id, cashier_user.username, cashier_user.role, active_event.id
    )


@pytest.fixture
def cashier_intake_user(registry_db):
    """User with the combined cashier_intake role (cashier + intake powers, no admin)."""
    from app.models.registry import RegistryUser
    from app.services.auth import hash_password

    user = RegistryUser(
        username="staff1",
        password_hash=hash_password("cashier123"),
        role="cashier_intake",
        is_active=True,
    )
    registry_db.add(user)
    registry_db.commit()
    registry_db.refresh(user)
    return user


@pytest.fixture
def cashier_intake_token(cashier_intake_user, active_event):
    from app.services.auth import create_access_token

    return create_access_token(
        cashier_intake_user.id,
        cashier_intake_user.username,
        cashier_intake_user.role,
        active_event.id,
    )


@pytest.fixture
def intake_user(registry_db):
    from app.models.registry import RegistryUser
    from app.services.auth import hash_password

    user = RegistryUser(
        username="intake1",
        password_hash=hash_password("intake123"),
        role="intake",
        is_active=True,
    )
    registry_db.add(user)
    registry_db.commit()
    registry_db.refresh(user)
    return user


@pytest.fixture
def intake_token(intake_user, active_event):
    from app.services.auth import create_access_token

    return create_access_token(
        intake_user.id, intake_user.username, intake_user.role, active_event.id
    )