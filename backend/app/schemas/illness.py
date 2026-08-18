"""Request and response schemas for the illness triage endpoint."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SymptomInput(BaseModel):
    """The 27 observable findings the triage model accepts.

    Every field is a boolean the owner can answer by observation alone — no
    clinical instruments and no veterinary judgement required. Field names
    match the feature names the model was trained on exactly; the service
    layer rejects any key it does not recognise.
    """

    model_config = ConfigDict(extra="forbid")

    # Appetite and gut
    not_eating_12h: bool = False
    reduced_appetite: bool = False
    no_faecal_pellets_12h: bool = False
    fewer_smaller_pellets: bool = False
    diarrhoea: bool = False
    bloated_abdomen: bool = False

    # Posture and behaviour
    hunched_posture: bool = False
    teeth_grinding: bool = False
    lethargy: bool = False
    unresponsive_or_collapsed: bool = False
    seizure: bool = False

    # Respiratory
    open_mouth_breathing: bool = False
    laboured_breathing: bool = False
    sneezing: bool = False
    nasal_discharge: bool = False

    # Neurological
    head_tilt: bool = False
    rolling_or_loss_of_balance: bool = False

    # Skin and external
    maggots_or_flystrike: bool = False
    soiled_rear: bool = False
    open_wound_bleeding: bool = False
    skin_lesion_minor: bool = False

    # Urinary
    blood_in_urine: bool = False
    straining_to_urinate: bool = False
    not_urinating: bool = False

    # Eyes and teeth
    eye_discharge: bool = False
    overgrown_teeth: bool = False

    # General
    weight_loss: bool = False


class IllnessCheckRequest(BaseModel):
    """Body for POST /illness/check."""

    symptoms: SymptomInput
    rabbit_id: uuid.UUID | None = Field(
        default=None,
        description="Optionally attach the check to one of your rabbits.",
    )


class IllnessCheckResult(BaseModel):
    """Triage outcome returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rabbit_id: uuid.UUID | None
    tier: Literal["normal", "monitor", "see_vet_now"]
    title: str
    summary: str
    actions: list[str]
    urgency_hours: int | None
    confidence: float
    reported_symptoms: list[str]
    symptom_count: int
    created_at: datetime

    disclaimer: str = (
        "This is a guidance tool, not a veterinary diagnosis. If you are "
        "worried about your rabbit, contact a vet."
    )


class IllnessCheckSummary(BaseModel):
    """Condensed record for the history list."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rabbit_id: uuid.UUID | None
    tier: str
    symptom_count: int
    created_at: datetime


class SymptomCatalogItem(BaseModel):
    """One selectable symptom, for building the UI."""

    key: str
    label: str
    group: str