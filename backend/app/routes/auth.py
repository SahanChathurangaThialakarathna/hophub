from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    hash_password,
    verify_password,
    waste_time_on_dummy_hash,
)
from app.db.session import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.user import Token, UserLogin, UserPublic, UserRegister

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> User:
    """Create a new HopHub account."""
    normalised_email = payload.email.lower().strip()

    existing = db.query(User).filter(User.email == normalised_email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        email=normalised_email,
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
        phone=payload.phone,
        location_city=payload.location_city,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    """Exchange email and password for a JWT access token."""
    normalised_email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == normalised_email).first()

    if user is None:
        waste_time_on_dummy_hash(payload.password)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated",
        )

    return Token(access_token=create_access_token(subject=str(user.id)))


@router.get("/me", response_model=UserPublic)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    """Return the profile of the authenticated user."""
    return current_user