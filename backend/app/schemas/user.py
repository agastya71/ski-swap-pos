"""Pydantic schemas for user creation and response."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    """Payload for creating a new user account scoped to the active event."""

    username: str = Field(description="Unique login name for the user.")
    password: str = Field(description="Plaintext password that will be hashed before storage.")
    role: Literal["admin", "intake", "cashier"] = Field(
        description="Role assigned to the user, controlling which operations they may perform."
    )


class UserResponse(BaseModel):
    """Read-only representation of a user record returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the user.")
    event_id: int = Field(description="ID of the event this user account belongs to.")
    username: str = Field(description="Unique login name for the user.")
    role: str = Field(description="Role assigned to the user (admin, intake, or cashier).")
    is_active: bool = Field(description="Whether the user account is currently enabled.")
