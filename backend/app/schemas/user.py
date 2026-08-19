"""Pydantic schemas for user creation and response."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.auth import validate_password


class UserCreate(BaseModel):
    """Payload for creating a new user account scoped to the active event."""

    username: str = Field(description="Unique login name for the user.")
    password: str = Field(description="Plaintext password that will be hashed before storage. Must meet the complexity policy.")
    role: Literal["admin", "intake", "cashier"] = Field(
        description="Role assigned to the user, controlling which operations they may perform."
    )

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        return validate_password(v)


class PasswordReset(BaseModel):
    """Payload for an admin resetting another user's password."""

    new_password: str = Field(description="New plaintext password. Must meet the complexity policy.")

    @field_validator("new_password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        return validate_password(v)


class UserResponse(BaseModel):
    """Read-only representation of a user record returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the user.")
    event_id: int = Field(description="ID of the event this user account belongs to.")
    username: str = Field(description="Unique login name for the user.")
    role: str = Field(description="Role assigned to the user (admin, intake, or cashier).")
    is_active: bool = Field(description="Whether the user account is currently enabled.")
