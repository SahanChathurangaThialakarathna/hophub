import uuid

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.user import User


class Rabbit(Base):
    """A rabbit owned by a HopHub user."""

    __tablename__ = "rabbits"

    __table_args__ = (
        CheckConstraint(
            "sex IN ('male', 'female', 'unknown')",
            name="ck_rabbits_sex",
        ),
        CheckConstraint(
            "weight_grams IS NULL OR weight_grams > 0",
            name="ck_rabbits_weight_positive",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(60), nullable=False)
    breed: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sex: Mapped[str] = mapped_column(String(10), default="unknown", nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    weight_grams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    colour: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    predicted_breed: Mapped[str | None] = mapped_column(String(50), nullable=True)
    breed_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    owner: Mapped["User"] = relationship(back_populates="rabbits")