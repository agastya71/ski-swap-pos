"""Pydantic schemas for event creation and response."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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


class EventResponse(BaseModel):
    """Read-only representation of an event record returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the event.")
    name: str = Field(description="Human-readable name for the event.")
    year: int = Field(description="Calendar year in which the event takes place.")
    commission_rate: float = Field(
        description="Fraction of each sale retained by MYSL for individual sellers."
    )
    vendor_commission_rate: float = Field(
        description="Fraction of each sale retained by MYSL for vendor sellers."
    )
    is_active: bool = Field(description="Whether this event is the currently active swap event.")
    created_at: datetime = Field(description="UTC timestamp when the event record was created.")
