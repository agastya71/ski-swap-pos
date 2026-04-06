"""Pydantic schemas for authentication — login request and token response."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Payload submitted by a user to obtain a JWT access token."""

    username: str = Field(description="The user's login username.")
    password: str = Field(description="The user's plaintext password (transmitted over local network only).")


class TokenResponse(BaseModel):
    """Response returned after a successful login containing the bearer token and session context."""

    access_token: str = Field(description="Signed JWT bearer token used to authenticate subsequent requests.")
    token_type: str = Field(default="bearer", description="Token scheme; always 'bearer'.")
    role: str = Field(description="Role assigned to the authenticated user (admin, intake, or cashier).")
    event_id: int = Field(description="ID of the active event the user is scoped to for this session.")
