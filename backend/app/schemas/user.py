"""Pydantic schemas for user creation and response."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.auth import validate_password


class UserCreate(BaseModel):
    """Payload for creating a new user account (shared registry — all events)."""

    username: str = Field(description="Unique login name for the user.")
    password: str = Field(description="Plaintext password that will be hashed before storage. Must meet the complexity policy.")
    role: Literal["admin", "intake", "cashier", "cashier_intake"] = Field(
        description="Role assigned to the user, controlling which operations they may perform. 'cashier_intake' combines the cashier and intake permission sets (no admin powers)."
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
    """Read-only representation of a user record returned by the API.

    Phase G: accounts are shared across events — ``event_id`` is kept for
    response compatibility and is always ``None`` (accounts have no event
    scope); the ACTIVE event id arrives via the auth token instead.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the user.")
    event_id: Optional[int] = Field(default=None, description="Always None since Phase G — accounts are event-agnostic (the active event id rides on the JWT).")
    username: str = Field(description="Globally unique login name for the user.")
    role: str = Field(description="Role assigned to the user (admin, intake, cashier, or cashier_intake).")
    is_active: bool = Field(description="Whether the user account is currently enabled.")
