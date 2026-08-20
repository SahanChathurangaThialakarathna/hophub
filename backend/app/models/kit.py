"""Persistence models for the kit growth tracker.

Three tables:

    kit_litters   one row per kindling event (a doe giving birth)
    kits          one row per individual baby rabbit in that litter
    kit_weights   one row per weighing of one kit on one day

The middle table is easy to overlook. A litter contains several kits, and it is
the INDIVIDUAL kit whose growth is tracked, so litter and kit cannot share a row.

AGE IS NEVER STORED
-------------------
Age in days is always computed as (kit_weights.measured_on -
kit_litters.kindling_date). It is not a column anywhere. If an owner corrects a
wrong kindling date, every derived age moves with it automatically. Storing age
would let the two fall out of step with no way to detect it afterwards.

OWNERSHIP
---------
user_id is repeated on all three tables even though it could be reached by
joining. This matches the pattern already used for rabbits and illness checks:
ownership is enforced IN THE QUERY (user_id == current_user.id) so a non-owned
row returns 404 rather than 403, disclosing nothing about whether it exists.
Denormalising user_id means that filter needs no join.

No ORM relationships to User or Rabbit are declared here. Adding them would
require editing app/models/user.py and app/models/rabbit.py to add matching
back_populates attributes. Ownership queries filter on user_id directly, so
those relationships would be unused weight.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


# ---------------------------------------------------------------------------
# Controlled vocabularies
# ---------------------------------------------------------------------------
# Stored as VARCHAR guarded by CheckConstraint, NOT as PostgreSQL native ENUM,
# matching the approach already used for illness_checks.tier. Native enums need
# a separate CREATE TYPE and an ALTER TYPE for every future value, which Alembic
# autogenerate does not detect.


class KitSex(str, enum.Enum):
    UNKNOWN = "unknown"
    MALE = "male"
    FEMALE = "female"


class KitStatus(str, enum.Enum):
    ACTIVE = "active"
    DIED = "died"
    REHOMED = "rehomed"


class HousingContext(str, enum.Enum):
    """Selects which published reference curve this litter is compared against.

    Derived from Palka et al. (2018), who found housing significantly affected
    growth from week 6 onward while breed did not. See
    ai_training/DATA_SOURCES.md and
    ai_training/reference/growth_reference_params.json.
    """

    INDIVIDUAL = "individual"   # single or paired housing -> 'battery' curve
    GROUP = "group"             # group pen or deep litter -> 'box' curve
    UNKNOWN = "unknown"         # falls back to 'battery'


class WeightSource(str, enum.Enum):
    """Separates real owner measurements from seeded demonstration data.

    Seeded weights must never be mistakable for real records, in the database
    or in an exported report.
    """

    OWNER = "owner"
    SEED = "seed"


class KitLitter(Base):
    """A single kindling event, anchoring all age calculations for its kits."""

    __tablename__ = "kit_litters"

    __table_args__ = (
        CheckConstraint(
            "housing_context IN ('individual', 'group', 'unknown')",
            name="ck_kit_litters_housing_context",
        ),
        CheckConstraint(
            "litter_size_born IS NULL OR litter_size_born >= 0",
            name="ck_kit_litters_size_born_nonneg",
        ),
        CheckConstraint(
            "litter_size_alive IS NULL OR litter_size_alive >= 0",
            name="ck_kit_litters_size_alive_nonneg",
        ),
        # A litter cannot have more survivors than births. Only enforced when
        # both values are supplied.
        CheckConstraint(
            "litter_size_born IS NULL OR litter_size_alive IS NULL "
            "OR litter_size_alive <= litter_size_born",
            name="ck_kit_litters_alive_le_born",
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

    # The mother, if she is recorded in the owner's rabbit list. Nullable, and
    # SET NULL on delete for the same reason as illness_checks.rabbit_id: the
    # litter's growth history must survive removal of the doe's record.
    doe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rabbits.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )

    # The date the litter was born. Anchor for ALL age calculations here.
    kindling_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Nullable because an owner may not have counted. A missing count is not
    # the same as a count of zero.
    litter_size_born: Mapped[int | None] = mapped_column(Integer, nullable=True)
    litter_size_alive: Mapped[int | None] = mapped_column(Integer, nullable=True)

    housing_context: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=HousingContext.UNKNOWN.value,
        server_default=HousingContext.UNKNOWN.value,
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    kits: Mapped[list["Kit"]] = relationship(
        back_populates="litter",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<KitLitter id={self.id} kindled={self.kindling_date}>"


class Kit(Base):
    """An individual kit within a litter."""

    __tablename__ = "kits"

    __table_args__ = (
        # Two kits in the same litter cannot share a label, or the owner cannot
        # tell their records apart. Separate litters may reuse labels freely.
        UniqueConstraint("litter_id", "identifier", name="uq_kits_litter_identifier"),
        CheckConstraint(
            "sex IN ('unknown', 'male', 'female')",
            name="ck_kits_sex",
        ),
        CheckConstraint(
            "status IN ('active', 'died', 'rehomed')",
            name="ck_kits_status",
        ),
        CheckConstraint(
            "length(trim(identifier)) > 0",
            name="ck_kits_identifier_nonblank",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    litter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("kit_litters.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Denormalised for ownership-in-query. See module docstring.
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Owner-supplied label. Kits are too small to ear-tag, so owners identify
    # them by markings, colour, or a dab of non-toxic nail polish. Free text
    # because that is what people actually use.
    identifier: Mapped[str] = mapped_column(String(50), nullable=False)

    # Not reliably determinable in the first weeks. Defaults to unknown rather
    # than forcing a guess that would then persist as though it were fact.
    sex: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default=KitSex.UNKNOWN.value,
        server_default=KitSex.UNKNOWN.value,
    )

    # A kit that dies must stop contributing to growth predictions without its
    # history being deleted. The weights recorded before it died are precisely
    # the data worth keeping.
    status: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default=KitStatus.ACTIVE.value,
        server_default=KitStatus.ACTIVE.value,
        index=True,
    )
    status_changed_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    litter: Mapped["KitLitter"] = relationship(back_populates="kits")
    weights: Mapped[list["KitWeight"]] = relationship(
        back_populates="kit",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="KitWeight.measured_on",
    )

    def __repr__(self) -> str:
        return f"<Kit id={self.id} identifier={self.identifier!r} status={self.status}>"


class KitWeight(Base):
    """A single weighing of one kit on one day."""

    __tablename__ = "kit_weights"

    __table_args__ = (
        # One weight per kit per day. Without this, a double tap on the save
        # button silently inserts a duplicate point and skews the regression,
        # with nothing on screen to indicate anything went wrong.
        UniqueConstraint("kit_id", "measured_on", name="uq_kit_weights_kit_day"),
        CheckConstraint(
            "entry_source IN ('owner', 'seed')",
            name="ck_kit_weights_entry_source",
        ),
        # Upper bound is a typo guard, not a biological claim. The largest
        # domestic breeds top out near 10 kg; anything above 15 kg is a
        # mis-keyed entry, most often grams typed where kilograms were meant.
        CheckConstraint(
            "weight_g > 0 AND weight_g < 15000",
            name="ck_kit_weights_plausible_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    kit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("kits.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # DATE, not DateTime. A kitchen scale gives daily granularity at best, and a
    # timestamp would imply precision the measurement does not have. It also
    # makes the one-per-day uniqueness rule above expressible.
    measured_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # INTEGER grams, not float. Scales read whole grams, and integers avoid
    # floating-point equality problems when these values feed the regression.
    weight_g: Mapped[int] = mapped_column(Integer, nullable=False)

    entry_source: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default=WeightSource.OWNER.value,
        server_default=WeightSource.OWNER.value,
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    kit: Mapped["Kit"] = relationship(back_populates="weights")

    def __repr__(self) -> str:
        return f"<KitWeight kit_id={self.kit_id} {self.measured_on} {self.weight_g}g>"
