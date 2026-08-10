import uuid
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Sex(str, Enum):
    male = "male"
    female = "female"
    unknown = "unknown"


class Breed(str, Enum):
    """The six breeds the CNN classifier is trained on, plus fallbacks."""
    dutch = "Dutch"
    lionhead = "Lionhead"
    new_zealand_white = "New Zealand White"
    rex = "Rex"
    angora = "Angora"
    himalayan = "Himalayan"
    mixed = "Mixed"
    unknown = "Unknown"


class RabbitCreate(BaseModel):
    """Request body for POST /rabbits."""
    name: str = Field(min_length=1, max_length=60)
    breed: Breed | None = None
    sex: Sex = Sex.unknown
    date_of_birth: date | None = None
    weight_grams: int | None = Field(default=None, gt=0, le=15000)
    colour: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=500)


class RabbitUpdate(BaseModel):
    """Request body for PATCH /rabbits/{id}. Every field optional."""
    name: str | None = Field(default=None, min_length=1, max_length=60)
    breed: Breed | None = None
    sex: Sex | None = None
    date_of_birth: date | None = None
    weight_grams: int | None = Field(default=None, gt=0, le=15000)
    colour: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=500)


class RabbitPublic(BaseModel):
    """Response model."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    breed: str | None
    sex: str
    date_of_birth: date | None
    weight_grams: int | None
    colour: str | None
    notes: str | None
    photo_url: str | None
    created_at: datetime
    updated_at: datetime