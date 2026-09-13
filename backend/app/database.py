from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 15},  # busy-wait 15 s
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    """Concurrency + integrity pragmas for every SQLite connection.

    - WAL journal: readers never block the writer and vice versa — multiple
      cashiers/intake operators + long report reads no longer collide with
      'database is locked' errors (rollback-journal mode blocked writers for
      the whole duration of any read).
    - foreign_keys=ON: orphaned rows become loud constraint errors instead of
      silent data loss (all app deletes cascade explicitly, so this only
      converts *future* forgotten-cascade bugs into errors).
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
