from typing import Annotated

import phonenumbers
from pydantic import BaseModel, ConfigDict, EmailStr, SecretStr
from pydantic_extra_types.phone_numbers import PhoneNumberValidator


PhoneNumberStr = Annotated[
    str | phonenumbers.PhoneNumber,
    PhoneNumberValidator(number_format="E164"),
]


class SignupRequest(BaseModel):
    email: EmailStr
    password: SecretStr
    first_name: str
    last_name: str
    phone_number: PhoneNumberStr | None = None
    country: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: SecretStr


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    first_name: str
    last_name: str
    phone_number: str | None = None
    country: str


class LoginResponse(UserOut):
    access_token: str
    token_type: str = "bearer"
