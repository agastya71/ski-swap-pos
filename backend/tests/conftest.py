import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app


@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db(db_engine):
    Session = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="function")
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── shared data fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def active_event(db):
    from app.models.event import Event

    event = Event(name="MYSL Swap 2026", year=2026, commission_rate=0.30, is_active=True)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@pytest.fixture
def admin_user(db, active_event):
    from app.models.user import User
    from app.services.auth import hash_password

    user = User(
        event_id=active_event.id,
        username="admin",
        password_hash=hash_password("admin123"),
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user, active_event):
    from app.services.auth import create_access_token

    return create_access_token(admin_user.id, admin_user.username, admin_user.role, active_event.id)


@pytest.fixture
def cashier_user(db, active_event):
    from app.models.user import User
    from app.services.auth import hash_password

    user = User(
        event_id=active_event.id,
        username="cashier1",
        password_hash=hash_password("cashier123"),
        role="cashier",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def cashier_token(cashier_user, active_event):
    from app.services.auth import create_access_token

    return create_access_token(
        cashier_user.id, cashier_user.username, cashier_user.role, active_event.id
    )


@pytest.fixture
def intake_user(db, active_event):
    from app.models.user import User
    from app.services.auth import hash_password

    user = User(
        event_id=active_event.id,
        username="intake1",
        password_hash=hash_password("intake123"),
        role="intake",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def intake_token(intake_user, active_event):
    from app.services.auth import create_access_token

    return create_access_token(
        intake_user.id, intake_user.username, intake_user.role, active_event.id
    )
