"""Pydantic schemas for seller creation, partial update, and response."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SellerCreate(BaseModel):
    """Payload for registering a new seller (consignor) in the active event."""

    first_name: str = Field(description="Seller's given name.")
    last_name: str = Field(description="Seller's family name.")
    company: Optional[str] = Field(default=None, description="Company or organization name, if the seller is a vendor.")
    is_vendor: bool = Field(default=False, description="True if this seller is a commercial vendor rather than an individual consignor.")
    email: Optional[str] = Field(default=None, description="Seller's email address.")
    phone: Optional[str] = Field(default=None, description="Seller's contact phone number.")
    address: Optional[str] = Field(default=None, description="Street address.")
    city: Optional[str] = Field(default=None, description="City.")
    state: Optional[str] = Field(default=None, description="Two-letter state abbreviation.")
    zip: Optional[str] = Field(default=None, description="ZIP code.")


class SellerUpdate(BaseModel):
    """Partial-update payload for modifying an existing seller record."""

    code: Optional[str] = Field(default=None, description="Updated seller code, if changing.")
    first_name: Optional[str] = Field(default=None, description="Updated given name, if changing.")
    last_name: Optional[str] = Field(default=None, description="Updated family name, if changing.")
    company: Optional[str] = Field(default=None, description="Updated company name, if changing.")
    is_vendor: Optional[bool] = Field(default=None, description="Updated vendor flag, if changing.")
    email: Optional[str] = Field(default=None, description="Updated email address, if changing.")
    phone: Optional[str] = Field(default=None, description="Updated phone number, if changing.")
    address: Optional[str] = Field(default=None, description="Updated street address, if changing.")
    city: Optional[str] = Field(default=None, description="Updated city, if changing.")
    state: Optional[str] = Field(default=None, description="Updated state abbreviation, if changing.")
    zip: Optional[str] = Field(default=None, description="Updated ZIP code, if changing.")


class SellerResponse(BaseModel):
    """Read-only representation of a seller record returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the seller.")
    event_id: int = Field(description="ID of the event this seller is registered in.")
    code: str = Field(description="Unique alphanumeric seller code.")
    first_name: str = Field(description="Seller's given name.")
    last_name: str = Field(description="Seller's family name.")
    company: Optional[str] = Field(default=None, description="Company or organization name, if applicable.")
    is_vendor: bool = Field(description="True if this seller is a commercial vendor.")
    email: Optional[str] = Field(default=None, description="Seller's email address.")
    phone: Optional[str] = Field(default=None, description="Seller's contact phone number.")
    address: Optional[str] = Field(default=None, description="Street address for the seller's mailing address.")
    city: Optional[str] = Field(default=None, description="City for the seller's mailing address.")
    state: Optional[str] = Field(default=None, description="Two-letter state abbreviation for the seller's mailing address.")
    zip: Optional[str] = Field(default=None, description="ZIP or postal code for the seller's mailing address.")
    created_at: datetime = Field(description="UTC timestamp when the seller record was created.")
