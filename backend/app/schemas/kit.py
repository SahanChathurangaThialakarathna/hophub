"""Request and response schemas for the kit growth tracker."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class KitSex(str, Enum):
    unknown = "unknown"
    male = "male"
    female = "female"


class KitStatus(str, Enum):
    active = "active"
    died = "died"
    rehomed = "rehomed"


class HousingContext(str, Enum):
    """Selects which published reference curve a litter is compared against.

    Palka et al. (2018) found housing significantly affected growth from week 6
    onward while breed did not, so housing — not breed — selects the curve.
    """

    individual = "individual"   # single or paired housing
    group = "group"             # group pen or deep litter
    unknown = "unknown"         # falls back to the individual curve


# Shared literal types, declared once so the route, service and summary
# schemas cannot drift apart.
AssessmentLabel = Literal[
    "unknown", "on_track", "above_reference", "below_reference", "falling_behind"
]
ConfidenceState = Literal["insufficient_data", "provisional", "established"]


# ---------------------------------------------------------------------------
# Litters
# ---------------------------------------------------------------------------

class LitterCreate(BaseModel):
    """Request body for POST /kits/litters."""

    model_config = ConfigDict(extra="forbid")

    kindling_date: date
    doe_id: uuid.UUID | None = Field(
        default=None,
        description="Optionally attach the litter to one of your rabbits.",
    )
    litter_size_born: int | None = Field(default=None, ge=0, le=20)
    litter_size_alive: int | None = Field(default=None, ge=0, le=20)
    housing_context: HousingContext = HousingContext.unknown
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("kindling_date")
    @classmethod
    def not_in_future(cls, v: date) -> date:
        # A litter cannot be born tomorrow. Caught here rather than in the
        # service so the client gets a 422 with a field-level message.
        if v > date.today():
            raise ValueError("kindling_date cannot be in the future")
        return v


class LitterUpdate(BaseModel):
    """Request body for PATCH /kits/litters/{id}. Every field optional."""

    model_config = ConfigDict(extra="forbid")

    kindling_date: date | None = None
    doe_id: uuid.UUID | None = None
    litter_size_born: int | None = Field(default=None, ge=0, le=20)
    litter_size_alive: int | None = Field(default=None, ge=0, le=20)
    housing_context: HousingContext | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("kindling_date")
    @classmethod
    def not_in_future(cls, v: date | None) -> date | None:
        if v is not None and v > date.today():
            raise ValueError("kindling_date cannot be in the future")
        return v


class LitterPublic(BaseModel):
    """Response model for a litter."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    doe_id: uuid.UUID | None
    kindling_date: date
    litter_size_born: int | None
    litter_size_alive: int | None
    housing_context: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Kits
# ---------------------------------------------------------------------------

class KitCreate(BaseModel):
    """Request body for POST /kits/litters/{litter_id}/kits."""

    model_config = ConfigDict(extra="forbid")

    # Owners identify kits by markings, colour, or a dab of non-toxic nail
    # polish, so this is free text rather than a number.
    identifier: str = Field(min_length=1, max_length=50)
    sex: KitSex = KitSex.unknown
    notes: str | None = Field(default=None, max_length=500)


class KitUpdate(BaseModel):
    """Request body for PATCH /kits/{id}. Every field optional."""

    model_config = ConfigDict(extra="forbid")

    identifier: str | None = Field(default=None, min_length=1, max_length=50)
    sex: KitSex | None = None
    status: KitStatus | None = None
    status_changed_on: date | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("status_changed_on")
    @classmethod
    def not_in_future(cls, v: date | None) -> date | None:
        if v is not None and v > date.today():
            raise ValueError("status_changed_on cannot be in the future")
        return v


class KitPublic(BaseModel):
    """Response model for an individual kit."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    litter_id: uuid.UUID
    user_id: uuid.UUID
    identifier: str
    sex: str
    status: str
    status_changed_on: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class KitSummary(BaseModel):
    """Condensed kit record for the litter detail screen.

    Carries just enough to render a status indicator per kit without the
    client making one full growth-analysis request per kit. A litter of eight
    would otherwise cost eight round trips to draw a single list.
    """

    id: uuid.UUID
    identifier: str
    sex: str
    status: str
    weight_count: int
    latest_measured_on: date | None
    latest_weight_g: int | None
    latest_age_days: int | None
    assessment: AssessmentLabel
    confidence_state: ConfidenceState


class LitterDetail(LitterPublic):
    """A litter together with a summary of each of its kits."""

    kits: list[KitSummary]


# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------

class KitWeightCreate(BaseModel):
    """Request body for POST /kits/{kit_id}/weights.

    measured_on is supplied by the client rather than defaulting to today,
    because owners routinely backfill a history after starting to track a
    litter that is already a few weeks old.

    Two rules cannot be enforced here and are checked in the route layer:
    that measured_on is not before the litter's kindling_date, and that no
    weight already exists for this kit on this date. Both need database
    context that the schema does not have.
    """

    model_config = ConfigDict(extra="forbid")

    measured_on: date
    weight_g: int = Field(
        gt=0,
        le=15000,
        description="Weight in whole grams. Upper bound is a typo guard.",
    )
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("measured_on")
    @classmethod
    def not_in_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("measured_on cannot be in the future")
        return v


class KitWeightPublic(BaseModel):
    """Response model for a single recorded weight."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kit_id: uuid.UUID
    measured_on: date
    weight_g: int
    entry_source: str
    notes: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Growth analysis
# ---------------------------------------------------------------------------

class GrowthPoint(BaseModel):
    """One measurement placed against the published reference curve.

    age_days is derived at query time from (measured_on - kindling_date) and
    is never stored, so correcting a wrong kindling date moves every age.
    """

    measured_on: date
    age_days: int
    age_weeks: float
    weight_g: int
    reference_g: float
    deviation_g: float
    deviation_pct: float


class GrowthTrend(BaseModel):
    """Ordinary least squares fit of deviation-from-reference against age.

    This is the component fitted to the owner's OWN measurements. It has no
    training set: the regression runs at request time on the points below.

    slope_g_per_week is the quantity that matters. A slope near zero means the
    kit is tracking the reference curve, whatever its absolute weight. A
    persistently negative slope means it is falling further behind week on
    week, which is the pattern worth flagging.
    """

    n_points: int
    slope_g_per_week: float
    intercept_g: float
    r_squared: float


class GrowthAnalysis(BaseModel):
    """Full growth assessment for one kit."""

    model_config = ConfigDict(from_attributes=True)

    kit_id: uuid.UUID
    identifier: str
    kindling_date: date
    latest_age_days: int | None

    # Which published curve was used, and its parameters, so a stored or
    # exported result can be interpreted later even if the curve is refitted.
    reference_group: Literal["battery", "box"]
    reference_label: str
    model_version: str

    points: list[GrowthPoint]
    trend: GrowthTrend | None

    # insufficient_data: fewer than 3 points, no regression attempted
    # provisional:       3 or 4 points, fitted but not yet trustworthy
    # established:       5 or more points
    confidence_state: ConfidenceState

    # on_track:         within the published spread of the reference
    # above_reference:  heavier than reference, usually not a concern
    # below_reference:  lighter, but holding a steady gap
    # falling_behind:   gap widening week on week — the pattern to act on
    assessment: AssessmentLabel
    message: str

    disclaimer: str = (
        "Reference weights come from published studies of commercial meat "
        "breeds and are a general guide, not a target. Individual rabbits "
        "vary widely. If you are worried about a kit, contact a vet."
    )


class ReferenceCurvePoint(BaseModel):
    """One point on the published reference curve, for plotting."""

    age_weeks: float
    reference_g: float


class ReferenceCurve(BaseModel):
    """The published reference curve, served so the app can draw it.

    Exposed as its own endpoint for the same reason the symptom catalogue is:
    refitting the curve updates the chart without a store release.
    """

    group: Literal["battery", "box"]
    label: str
    model_version: str
    asymptote_g: float
    b: float
    k_per_week: float
    source_citation: str
    points: list[ReferenceCurvePoint]
