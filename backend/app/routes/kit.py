"""Kit growth tracker endpoints.

URL SHAPE
---------
Nested to mirror the real hierarchy: a weight belongs to a kit, a kit belongs
to a litter. Creating a kit outside a litter is impossible by construction
rather than by validation.

    POST   /kits/litters                      create a litter
    GET    /kits/litters                      list litters
    GET    /kits/litters/{litter_id}          litter with per-kit summaries
    PATCH  /kits/litters/{litter_id}          edit a litter
    DELETE /kits/litters/{litter_id}          remove a litter and its kits
    POST   /kits/litters/{litter_id}/kits     add a kit
    GET    /kits/reference-curve              published curve, for plotting
    GET    /kits/{kit_id}                     one kit
    PATCH  /kits/{kit_id}                     edit a kit
    DELETE /kits/{kit_id}                     remove a kit
    POST   /kits/{kit_id}/weights             record a weighing
    GET    /kits/{kit_id}/weights             weighing history
    DELETE /kits/weights/{weight_id}          remove a weighing
    GET    /kits/{kit_id}/growth              full growth assessment

ROUTE ORDER MATTERS. FastAPI matches in declaration order, so every literal
path segment ('/litters', '/reference-curve', '/weights/...') is declared
BEFORE '/{kit_id}'. Declared the other way round, a request for
/kits/reference-curve would be matched by /kits/{kit_id} and fail trying to
parse 'reference-curve' as a UUID.

OWNERSHIP
---------
Every lookup filters on user_id == current_user.id in the query itself, the
same pattern as the rabbit and illness routes. A row belonging to another user
returns 404, not 403, so the response discloses nothing about whether it
exists.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.models.kit import Kit, KitLitter, KitWeight
from app.models.rabbit import Rabbit
from app.models.user import User
from app.schemas.kit import (
    GrowthAnalysis,
    KitCreate,
    KitPublic,
    KitSummary,
    KitUpdate,
    KitWeightCreate,
    KitWeightPublic,
    LitterCreate,
    LitterDetail,
    LitterPublic,
    LitterUpdate,
    ReferenceCurve,
)
from app.services import growth_service

router = APIRouter(prefix="/kits", tags=["Kit growth"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_owned_litter(db: Session, litter_id: uuid.UUID, user: User) -> KitLitter:
    """Fetch a litter the caller owns, or raise 404."""
    litter = (
        db.query(KitLitter)
        .filter(KitLitter.id == litter_id, KitLitter.user_id == user.id)
        .first()
    )
    if litter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Litter not found"
        )
    return litter


def _get_owned_kit(db: Session, kit_id: uuid.UUID, user: User) -> Kit:
    """Fetch a kit the caller owns, or raise 404."""
    kit = (
        db.query(Kit).filter(Kit.id == kit_id, Kit.user_id == user.id).first()
    )
    if kit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Kit not found"
        )
    return kit


def _assert_owned_doe(db: Session, doe_id: uuid.UUID | None, user: User) -> None:
    """If a doe is named, confirm the caller owns it."""
    if doe_id is None:
        return
    owned = (
        db.query(Rabbit)
        .filter(Rabbit.id == doe_id, Rabbit.owner_id == user.id)
        .first()
    )
    if owned is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rabbit not found"
        )


# ---------------------------------------------------------------------------
# Litters
# ---------------------------------------------------------------------------

@router.post(
    "/litters", response_model=LitterPublic, status_code=status.HTTP_201_CREATED
)
def create_litter(
    payload: LitterCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KitLitter:
    """Record a kindling event."""
    _assert_owned_doe(db, payload.doe_id, current_user)

    litter = KitLitter(
        user_id=current_user.id,
        doe_id=payload.doe_id,
        kindling_date=payload.kindling_date,
        litter_size_born=payload.litter_size_born,
        litter_size_alive=payload.litter_size_alive,
        housing_context=payload.housing_context.value,
        notes=payload.notes,
    )
    db.add(litter)
    db.commit()
    db.refresh(litter)
    return litter


@router.get("/litters", response_model=list[LitterPublic])
def list_litters(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[KitLitter]:
    """Litters belonging to the authenticated user, newest first."""
    return (
        db.query(KitLitter)
        .filter(KitLitter.user_id == current_user.id)
        .order_by(KitLitter.kindling_date.desc())
        .limit(limit)
        .all()
    )


@router.get("/litters/{litter_id}", response_model=LitterDetail)
def get_litter(
    litter_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """A litter with a growth summary for each of its kits.

    All weights for the litter are fetched in ONE query and grouped in memory,
    rather than querying per kit. A litter of eight kits would otherwise issue
    nine queries to render one screen.
    """
    litter = _get_owned_litter(db, litter_id, current_user)

    kits = (
        db.query(Kit)
        .filter(Kit.litter_id == litter.id)
        .order_by(Kit.identifier)
        .all()
    )
    kit_ids = [k.id for k in kits]

    weights_by_kit: dict[uuid.UUID, list[KitWeight]] = {kid: [] for kid in kit_ids}
    if kit_ids:
        rows = (
            db.query(KitWeight)
            .filter(KitWeight.kit_id.in_(kit_ids))
            .order_by(KitWeight.measured_on)
            .all()
        )
        for row in rows:
            weights_by_kit[row.kit_id].append(row)

    summaries: list[KitSummary] = []
    for kit in kits:
        rows = weights_by_kit.get(kit.id, [])
        analysis = growth_service.analyse_growth(
            kit_id=kit.id,
            identifier=kit.identifier,
            kindling_date=litter.kindling_date,
            housing_context=litter.housing_context,
            weights=[(r.measured_on, r.weight_g) for r in rows],
        )
        latest = analysis["points"][-1] if analysis["points"] else None

        summaries.append(
            KitSummary(
                id=kit.id,
                identifier=kit.identifier,
                sex=kit.sex,
                status=kit.status,
                weight_count=len(rows),
                latest_measured_on=latest["measured_on"] if latest else None,
                latest_weight_g=latest["weight_g"] if latest else None,
                latest_age_days=latest["age_days"] if latest else None,
                assessment=analysis["assessment"],
                confidence_state=analysis["confidence_state"],
            )
        )

    return {
        "id": litter.id,
        "user_id": litter.user_id,
        "doe_id": litter.doe_id,
        "kindling_date": litter.kindling_date,
        "litter_size_born": litter.litter_size_born,
        "litter_size_alive": litter.litter_size_alive,
        "housing_context": litter.housing_context,
        "notes": litter.notes,
        "created_at": litter.created_at,
        "updated_at": litter.updated_at,
        "kits": summaries,
    }


@router.patch("/litters/{litter_id}", response_model=LitterPublic)
def update_litter(
    litter_id: uuid.UUID,
    payload: LitterUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KitLitter:
    """Edit a litter. Only the fields supplied are changed."""
    litter = _get_owned_litter(db, litter_id, current_user)

    # exclude_unset so an omitted field is left alone rather than set to None.
    changes = payload.model_dump(exclude_unset=True)

    if "doe_id" in changes:
        _assert_owned_doe(db, changes["doe_id"], current_user)

    if "housing_context" in changes and changes["housing_context"] is not None:
        changes["housing_context"] = changes["housing_context"].value

    # Moving the kindling date moves every derived age, so reject a change
    # that would strand existing weights before the litter was born.
    if changes.get("kindling_date") is not None:
        earliest = (
            db.query(KitWeight.measured_on)
            .join(Kit, Kit.id == KitWeight.kit_id)
            .filter(Kit.litter_id == litter.id)
            .order_by(KitWeight.measured_on)
            .first()
        )
        if earliest is not None and changes["kindling_date"] > earliest[0]:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Kindling date cannot be later than the earliest recorded "
                    f"weight ({earliest[0].isoformat()})."
                ),
            )

    for field, value in changes.items():
        setattr(litter, field, value)

    db.commit()
    db.refresh(litter)
    return litter


@router.delete("/litters/{litter_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_litter(
    litter_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a litter, its kits, and their weights."""
    litter = _get_owned_litter(db, litter_id, current_user)
    db.delete(litter)
    db.commit()


# ---------------------------------------------------------------------------
# Kits
# ---------------------------------------------------------------------------

@router.post(
    "/litters/{litter_id}/kits",
    response_model=KitPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_kit(
    litter_id: uuid.UUID,
    payload: KitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Kit:
    """Add an individual kit to a litter."""
    litter = _get_owned_litter(db, litter_id, current_user)

    kit = Kit(
        litter_id=litter.id,
        user_id=current_user.id,
        identifier=payload.identifier.strip(),
        sex=payload.sex.value,
        notes=payload.notes,
    )
    db.add(kit)

    try:
        db.commit()
    except IntegrityError:
        # uq_kits_litter_identifier: two kits in one litter cannot share a
        # label, or the owner cannot tell their records apart.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A kit called '{payload.identifier}' already exists in this litter.",
        )

    db.refresh(kit)
    return kit


# Declared before /{kit_id} so 'reference-curve' is never parsed as a UUID.
@router.get("/reference-curve", response_model=ReferenceCurve)
def reference_curve(
    group: str = Query(
        default="battery",
        pattern="^(battery|box)$",
        description="battery = individually or pair-housed, box = group-housed",
    ),
    max_weeks: float = Query(default=12.0, gt=0, le=20),
) -> dict:
    """The published reference curve, as points the client can plot.

    Served rather than hardcoded in the app so that refitting the curve
    updates every device without a store release.

    No authentication: this is published literature, not user data.
    """
    return growth_service.build_reference_curve(group, max_weeks=max_weeks)


# Declared before /{kit_id} for the same reason as above.
@router.delete("/weights/{weight_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_weight(
    weight_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove a single weighing, for correcting a mistyped entry."""
    weight = (
        db.query(KitWeight)
        .filter(KitWeight.id == weight_id, KitWeight.user_id == current_user.id)
        .first()
    )
    if weight is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Weight record not found"
        )
    db.delete(weight)
    db.commit()


@router.get("/{kit_id}", response_model=KitPublic)
def get_kit(
    kit_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Kit:
    """One kit belonging to the authenticated user."""
    return _get_owned_kit(db, kit_id, current_user)


@router.patch("/{kit_id}", response_model=KitPublic)
def update_kit(
    kit_id: uuid.UUID,
    payload: KitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Kit:
    """Edit a kit. Only the fields supplied are changed."""
    kit = _get_owned_kit(db, kit_id, current_user)

    changes = payload.model_dump(exclude_unset=True)

    for field in ("sex", "status"):
        if field in changes and changes[field] is not None:
            changes[field] = changes[field].value

    if "identifier" in changes and changes["identifier"] is not None:
        changes["identifier"] = changes["identifier"].strip()

    for field, value in changes.items():
        setattr(kit, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another kit in this litter already uses that name.",
        )

    db.refresh(kit)
    return kit


@router.delete("/{kit_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_kit(
    kit_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a kit and its weight history.

    To record a kit that died, PATCH its status to 'died' instead. That keeps
    the weights recorded before it died, which are the data worth having.
    """
    kit = _get_owned_kit(db, kit_id, current_user)
    db.delete(kit)
    db.commit()


# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------

@router.post(
    "/{kit_id}/weights",
    response_model=KitWeightPublic,
    status_code=status.HTTP_201_CREATED,
)
def record_weight(
    kit_id: uuid.UUID,
    payload: KitWeightCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> KitWeight:
    """Record a weighing.

    The date is client-supplied rather than 'now', because owners routinely
    backfill a history for a litter that is already several weeks old.
    """
    kit = _get_owned_kit(db, kit_id, current_user)
    litter = _get_owned_litter(db, kit.litter_id, current_user)

    # Needs the litter's kindling date, so it cannot be a schema validator.
    if payload.measured_on < litter.kindling_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Measurement date {payload.measured_on.isoformat()} is before "
                f"the litter was born ({litter.kindling_date.isoformat()})."
            ),
        )

    weight = KitWeight(
        kit_id=kit.id,
        user_id=current_user.id,
        measured_on=payload.measured_on,
        weight_g=payload.weight_g,
        entry_source="owner",
        notes=payload.notes,
    )
    db.add(weight)

    try:
        db.commit()
    except IntegrityError:
        # uq_kit_weights_kit_day. Most often a double tap on save, which would
        # otherwise silently add a duplicate point and skew the regression.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A weight is already recorded for this kit on "
                f"{payload.measured_on.isoformat()}. Delete it first to replace it."
            ),
        )

    db.refresh(weight)
    return weight


@router.get("/{kit_id}/weights", response_model=list[KitWeightPublic])
def list_weights(
    kit_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[KitWeight]:
    """Every recorded weighing for one kit, oldest first."""
    kit = _get_owned_kit(db, kit_id, current_user)
    return (
        db.query(KitWeight)
        .filter(KitWeight.kit_id == kit.id)
        .order_by(KitWeight.measured_on)
        .all()
    )


# ---------------------------------------------------------------------------
# Growth analysis
# ---------------------------------------------------------------------------

@router.get("/{kit_id}/growth", response_model=GrowthAnalysis)
def kit_growth(
    kit_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Full growth assessment for one kit.

    The reference curve comes from published literature; the deviation trend
    is regressed on this kit's own recorded weights at request time. Nothing
    is cached: the fit costs microseconds and a cached result could go stale
    after an edit or a deletion.
    """
    kit = _get_owned_kit(db, kit_id, current_user)
    litter = _get_owned_litter(db, kit.litter_id, current_user)

    rows = (
        db.query(KitWeight)
        .filter(KitWeight.kit_id == kit.id)
        .order_by(KitWeight.measured_on)
        .all()
    )

    try:
        return growth_service.analyse_growth(
            kit_id=kit.id,
            identifier=kit.identifier,
            kindling_date=litter.kindling_date,
            housing_context=litter.housing_context,
            weights=[(r.measured_on, r.weight_g) for r in rows],
        )
    except ValueError as exc:
        # Raised when a weight predates the kindling date, which the PATCH
        # guard prevents but older data could still contain.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
