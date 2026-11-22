"""Pydantic schemas for event creation and response."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EventCreate(BaseModel):
    """Payload for creating a new swap event."""

    name: str = Field(description="Human-readable name for the event (e.g., 'MYSL 2026 Ski Swap').")
    year: int = Field(description="Calendar year in which the event takes place.")
    commission_rate: float = Field(
        default=0.30,
        ge=0.0,
        le=1.0,
        description="Fraction of each sale retained by MYSL for individual (non-vendor) sellers (e.g., 0.30 for 30%).",
    )
    vendor_commission_rate: float = Field(
        default=0.30,
        ge=0.0,
        le=1.0,
        description="Fraction of each sale retained by MYSL for vendor sellers (e.g., 0.25 for 25%).",
    )
    exempt_seller_codes: list[str] | None = Field(
        default=None,
        description="Seller codes (e.g. ['MYSL2']) whose sale proceeds are exempt from commission: full price goes to the seller, MYSL share is 0. Compared case-insensitively.",
    )


class EventResponse(BaseModel):
    """Read-only representation of an event record returned by the API.

    Phase G: events live in the registry; ``db_filename`` names the event's
    dedicated SQLite file under ``backend/events/``.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the event (mirrored as event.id inside its own database).")
    name: str = Field(description="Human-readable name for the event.")
    year: int = Field(description="Calendar year in which the event takes place.")
    commission_rate: float = Field(
        description="Fraction of each sale retained by MYSL for individual sellers."
    )
    vendor_commission_rate: float = Field(
        description="Fraction of each sale retained by MYSL for vendor sellers."
    )
    exempt_seller_codes: list[str] = Field(
        description="Seller codes exempt from commission (empty if none). Case preserved as stored; compared case-insensitively at report time."
    )
    is_active: bool = Field(description="Whether this event is the currently active swap event.")
    db_filename: str = Field(description="Filename of this event's dedicated SQLite database (under backend/events/).")
    created_at: datetime = Field(description="UTC timestamp when the event record was created.")

    @field_validator("exempt_seller_codes", mode="before")
    @classmethod
    def _coerce_exempt_codes(cls, value: object) -> list[str]:
        """Accept the ORM's comma-string (or None) and normalise to a list."""
        if value is None:
            return []
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return list(value)  # pyright: ignore[reportArgumentType]  (already iterable of str)

