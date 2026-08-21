from pydantic import SecretStr
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, hash_password, verify_password
from app.schemas.auth import SignupRequest
from db.models import User


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


def signup_user(db: Session, payload: SignupRequest) -> User:
    if db.query(User).filter(User.email == payload.email).first():
        raise EmailAlreadyRegisteredError(f"{payload.email} is already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password.get_secret_value()),
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone_number=payload.phone_number,
        country=payload.country,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: SecretStr) -> tuple[User, str]:
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(password.get_secret_value(), user.hashed_password):
        raise InvalidCredentialsError("Invalid email or password")
    token = create_access_token(user.id)
    return user, token
