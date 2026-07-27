from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base class that every ORM model inherits from."""
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a database session, always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()