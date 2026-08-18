"""Pydantic schemas for intake session creation, update, and response."""

import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.item import ItemResponse


class IntakeCreate(BaseModel):
    """Payload for opening a new intake session for a seller's consigned items."""

    seller_id: int = Field(description="ID of the seller whose items are being received.")
    date_entered: Optional[datetime.date] = Field(
        default=None,
        description="Date the intake record was entered into the system; defaults to today if omitted.",
    )
    date_received: Optional[datetime.date] = Field(
        default=None,
        description="Date the physical items were received at the swap venue.",
    )
    donate_unsold: Optional[bool] = Field(
        default=None,
        description="If True, any items not sold will be donated rather than returned. "
        "Omit (null) to inherit the seller's donate_unsold_default.",
    )
    donate_proceeds: Optional[bool] = Field(
        default=None,
        description="If True, the seller's share of sale proceeds will be donated. "
        "Omit (null) to inherit the seller's donate_proceeds_default.",
    )


class IntakeUpdate(BaseModel):
    """Partial-update payload for modifying an existing intake session."""

    date_received: Optional[datetime.date] = Field(
        default=None,
        description="Updated date items were physically received, if changing.",
    )
    donate_unsold: Optional[bool] = Field(
        default=None,
        description="Updated donation preference for unsold items, if changing.",
    )
    donate_proceeds: Optional[bool] = Field(
        default=None,
        description="Updated donation preference for sale proceeds, if changing.",
    )


class IntakeResponse(BaseModel):
    """Read-only representation of an intake session returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the intake session.")
    seller_id: int = Field(description="ID of the seller whose items were received.")
    date_entered: datetime.date = Field(description="Date the intake record was entered into the system.")
    date_received: Optional[datetime.date] = Field(
        default=None,
        description="Date the physical items were received at the swap venue.",
    )
    donate_unsold: bool = Field(
        description="Whether unsold items from this intake will be donated."
    )
    donate_proceeds: bool = Field(
        description="Whether the seller's share of proceeds from this intake will be donated."
    )
    total: float = Field(description="Sum of all item prices in this intake (gross consignment value).")
    mysl_total: float = Field(
        description="Portion of total sales from this intake retained by MYSL as commission."
    )
    seller_total: float = Field(
        description="Portion of total sales from this intake to be paid out to the seller."
    )
    created_at: datetime.datetime = Field(description="UTC timestamp when the intake record was created.")


class IntakeWithItemsResponse(IntakeResponse):
    """Extended intake response that includes the full list of consigned items."""

    items: list[ItemResponse] = Field(
        default=[],
        description="All items registered under this intake session.",
    )
