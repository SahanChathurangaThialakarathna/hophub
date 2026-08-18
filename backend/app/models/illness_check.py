"""Persistence model for illness triage checks."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

if TYPE_CHECKING:
    from app.models.rabbit import Rabbit
    from app.models.user import User


class IllnessCheck(Base):
    """A single triage assessment, retained as a health history record."""

    __tablename__ = "illness_checks"

    __table_args__ = (
        CheckConstraint(
            "tier IN ('normal', 'monitor', 'see_vet_now')",
            name="ck_illness_checks_tier",
        ),
        CheckConstraint(
            "confidence >= 0 AND confidence <= 1",
            name="ck_illness_checks_confidence_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Nullable: an owner may run a check before adding the rabbit to the app,
    # or about a rabbit they do not own. SET NULL rather than CASCADE on
    # delete, so the health history survives removal of the rabbit record.
    rabbit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rabbits.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # The full symptom vector as submitted. Stored as JSONB rather than 27
    # columns: the symptom set is model-defined and will change when the
    # model is retrained, and a schema migration per feature change would be
    # unreasonable. JSONB is queryable and indexable in PostgreSQL, so this
    # is not merely an opaque blob.
    symptoms: Mapped[dict] = mapped_column(JSONB, nullable=False)

    tier: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    symptom_count: Mapped[int] = mapped_column(Integer, nullable=False)

    # Which model produced this result. Essential for interpreting historical
    # records after the model is retrained — without it, a past assessment
    # cannot be attributed to a known version of the classifier.
    model_version: Mapped[str] = mapped_column(String(50), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    user: Mapped["User"] = relationship(back_populates="illness_checks")
    rabbit: Mapped["Rabbit | None"] = relationship(back_populates="illness_checks")