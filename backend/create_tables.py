"""One-off schema creation. Replaced by Alembic migrations in Sprint 2."""

from app.db.session import Base, engine
from app.models import Rabbit, User  # noqa: F401 — imports register both tables

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Tables created:", list(Base.metadata.tables.keys()))