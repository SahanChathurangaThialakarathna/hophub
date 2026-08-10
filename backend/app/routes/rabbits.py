import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_current_user
from app.models.rabbit import Rabbit
from app.models.user import User
from app.schemas.rabbit import RabbitCreate, RabbitPublic, RabbitUpdate

router = APIRouter(prefix="/rabbits", tags=["Rabbits"])


def _get_owned_rabbit(rabbit_id: uuid.UUID, owner_id: uuid.UUID, db: Session) -> Rabbit:
    """Fetch a rabbit that belongs to this owner, or raise 404."""
    rabbit = (
        db.query(Rabbit)
        .filter(Rabbit.id == rabbit_id, Rabbit.owner_id == owner_id)
        .first()
    )
    if rabbit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rabbit not found",
        )
    return rabbit


@router.post("", response_model=RabbitPublic, status_code=status.HTTP_201_CREATED)
def create_rabbit(
    payload: RabbitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Rabbit:
    """Register a new rabbit belonging to the authenticated user."""
    rabbit = Rabbit(
        owner_id=current_user.id,
        name=payload.name.strip(),
        breed=payload.breed.value if payload.breed else None,
        sex=payload.sex.value,
        date_of_birth=payload.date_of_birth,
        weight_grams=payload.weight_grams,
        colour=payload.colour,
        notes=payload.notes,
    )
    db.add(rabbit)
    db.commit()
    db.refresh(rabbit)
    return rabbit


@router.get("", response_model=list[RabbitPublic])
def list_rabbits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Rabbit]:
    """List every rabbit owned by the authenticated user."""
    return (
        db.query(Rabbit)
        .filter(Rabbit.owner_id == current_user.id)
        .order_by(Rabbit.created_at.desc())
        .all()
    )


@router.get("/{rabbit_id}", response_model=RabbitPublic)
def get_rabbit(
    rabbit_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Rabbit:
    """Fetch one rabbit owned by the authenticated user."""
    return _get_owned_rabbit(rabbit_id, current_user.id, db)


@router.patch("/{rabbit_id}", response_model=RabbitPublic)
def update_rabbit(
    rabbit_id: uuid.UUID,
    payload: RabbitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Rabbit:
    """Partially update a rabbit. Only supplied fields are changed."""
    rabbit = _get_owned_rabbit(rabbit_id, current_user.id, db)

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if hasattr(value, "value"):  # unwrap Enum members
            value = value.value
        setattr(rabbit, field, value)

    db.commit()
    db.refresh(rabbit)
    return rabbit


@router.delete("/{rabbit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rabbit(
    rabbit_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Permanently delete a rabbit owned by the authenticated user."""
    rabbit = _get_owned_rabbit(rabbit_id, current_user.id, db)
    db.delete(rabbit)
    db.commit()