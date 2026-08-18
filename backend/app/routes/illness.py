"""Illness triage endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.models.illness_check import IllnessCheck
from app.models.rabbit import Rabbit
from app.models.user import User
from app.schemas.illness import (
    IllnessCheckRequest,
    IllnessCheckResult,
    IllnessCheckSummary,
    SymptomCatalogItem,
)
from app.services import illness_service

router = APIRouter(prefix="/illness", tags=["Illness triage"])

MODEL_VERSION = "illness_tree_v1"

# Groupings for the client UI. Held here rather than in the frontend so the
# symptom list and its presentation stay in step with the model's feature
# set — a symptom added at retraining appears in the app without a release.
SYMPTOM_CATALOG: list[dict[str, str]] = [
    # Eating and droppings
    {"key": "not_eating_12h", "label": "Has not eaten for 12 hours or more", "group": "Eating and droppings"},
    {"key": "reduced_appetite", "label": "Eating less than usual", "group": "Eating and droppings"},
    {"key": "no_faecal_pellets_12h", "label": "No droppings for 12 hours or more", "group": "Eating and droppings"},
    {"key": "fewer_smaller_pellets", "label": "Fewer or smaller droppings", "group": "Eating and droppings"},
    {"key": "diarrhoea", "label": "Diarrhoea or very soft droppings", "group": "Eating and droppings"},
    {"key": "bloated_abdomen", "label": "Swollen or bloated tummy", "group": "Eating and droppings"},
    # Behaviour
    {"key": "hunched_posture", "label": "Sitting hunched up, pressing tummy down", "group": "Behaviour"},
    {"key": "teeth_grinding", "label": "Grinding teeth loudly", "group": "Behaviour"},
    {"key": "lethargy", "label": "Unusually quiet or inactive", "group": "Behaviour"},
    {"key": "unresponsive_or_collapsed", "label": "Collapsed or not responding", "group": "Behaviour"},
    {"key": "seizure", "label": "Fitting or convulsing", "group": "Behaviour"},
    # Breathing
    {"key": "open_mouth_breathing", "label": "Breathing through an open mouth", "group": "Breathing"},
    {"key": "laboured_breathing", "label": "Struggling or straining to breathe", "group": "Breathing"},
    {"key": "sneezing", "label": "Sneezing", "group": "Breathing"},
    {"key": "nasal_discharge", "label": "Runny or crusty nose", "group": "Breathing"},
    # Balance
    {"key": "head_tilt", "label": "Head tilted to one side", "group": "Balance"},
    {"key": "rolling_or_loss_of_balance", "label": "Rolling over or losing balance", "group": "Balance"},
    # Skin and coat
    {"key": "maggots_or_flystrike", "label": "Maggots on or near the rabbit", "group": "Skin and coat"},
    {"key": "soiled_rear", "label": "Dirty or matted bottom", "group": "Skin and coat"},
    {"key": "open_wound_bleeding", "label": "Open wound or bleeding", "group": "Skin and coat"},
    {"key": "skin_lesion_minor", "label": "Small sore or bald patch", "group": "Skin and coat"},
    # Toileting
    {"key": "blood_in_urine", "label": "Blood in urine", "group": "Toileting"},
    {"key": "straining_to_urinate", "label": "Straining to pass urine", "group": "Toileting"},
    {"key": "not_urinating", "label": "Not passing urine at all", "group": "Toileting"},
    # Eyes and teeth
    {"key": "eye_discharge", "label": "Watery or crusty eyes", "group": "Eyes and teeth"},
    {"key": "overgrown_teeth", "label": "Overgrown front teeth", "group": "Eyes and teeth"},
    # General
    {"key": "weight_loss", "label": "Losing weight", "group": "General"},
]


@router.get("/symptoms", response_model=list[SymptomCatalogItem])
def list_symptoms() -> list[dict[str, str]]:
    """The selectable symptoms, with plain-language labels and groupings."""
    return SYMPTOM_CATALOG


@router.post("/check", response_model=IllnessCheckResult, status_code=status.HTTP_201_CREATED)
def run_check(
    payload: IllnessCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> IllnessCheckResult:
    """Assess reported symptoms and return a triage tier."""
    # If a rabbit is named, confirm the caller owns it. Same in-query
    # ownership filter as the rabbit routes: a rabbit belonging to another
    # user is simply not found.
    if payload.rabbit_id is not None:
        owned = (
            db.query(Rabbit)
            .filter(Rabbit.id == payload.rabbit_id, Rabbit.owner_id == current_user.id)
            .first()
        )
        if owned is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Rabbit not found",
            )

    symptoms = payload.symptoms.model_dump()

    try:
        prediction = illness_service.predict(symptoms)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    record = IllnessCheck(
        user_id=current_user.id,
        rabbit_id=payload.rabbit_id,
        symptoms=symptoms,
        tier=prediction["tier"],
        confidence=prediction["confidence"],
        symptom_count=prediction["symptom_count"],
        model_version=MODEL_VERSION,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return IllnessCheckResult(
        id=record.id,
        rabbit_id=record.rabbit_id,
        tier=prediction["tier"],
        title=prediction["title"],
        summary=prediction["summary"],
        actions=prediction["actions"],
        urgency_hours=prediction["urgency_hours"],
        confidence=prediction["confidence"],
        reported_symptoms=prediction["reported_symptoms"],
        symptom_count=prediction["symptom_count"],
        created_at=record.created_at,
    )


@router.get("/history", response_model=list[IllnessCheckSummary])
def check_history(
    rabbit_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[IllnessCheck]:
    """Past checks run by the authenticated user, newest first."""
    query = db.query(IllnessCheck).filter(IllnessCheck.user_id == current_user.id)

    if rabbit_id is not None:
        query = query.filter(IllnessCheck.rabbit_id == rabbit_id)

    return query.order_by(IllnessCheck.created_at.desc()).limit(limit).all()