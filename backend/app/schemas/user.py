import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRegister(BaseModel):
    """Request body for POST /auth/register."""
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=72)
    phone: str | None = Field(default=None, max_length=20)
    location_city: str | None = Field(default=None, max_length=100)


class UserLogin(BaseModel):
    """Request body for POST /auth/login."""
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    """Response model. Note: no password field exists here at all."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    location_city: str | None
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"