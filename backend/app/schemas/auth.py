"""Pydantic schemas for authentication — login request and token response."""

from pydantic import BaseModel, Field, field_validator

from app.services.auth import validate_password


class LoginRequest(BaseModel):
    """Payload submitted by a user to obtain a JWT access token."""

    username: str = Field(description="The user's login username.")
    password: str = Field(description="The user's plaintext password (transmitted over local network only).")


class PasswordChange(BaseModel):
    """Payload for an authenticated user changing their own password."""

    old_password: str = Field(description="The user's current plaintext password, re-verified before the change.")
    new_password: str = Field(description="New plaintext password. Must meet the complexity policy and differ from the old password.")

    @field_validator("new_password")
    @classmethod
    def _validate_new_password(cls, v: str) -> str:
        return validate_password(v)


class TokenResponse(BaseModel):
    """Response returned after a successful login containing the bearer token and session context."""

    access_token: str = Field(description="Signed JWT bearer token used to authenticate subsequent requests.")
    token_type: str = Field(default="bearer", description="Token scheme; always 'bearer'.")
    role: str = Field(description="Role assigned to the authenticated user (admin, intake, or cashier).")
    event_id: int = Field(description="ID of the active event the user is scoped to for this session.")
