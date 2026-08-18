"""Pydantic schemas for seller creation, partial update, and response.

Validation rules (enforced here, not at the DB layer):
- An individual seller (is_vendor=False) requires first_name AND last_name.
- A vendor (is_vendor=True) requires company and is never a person: first/last
  name are optional and typically omitted.
- At least one of phone or email must be provided.
- email must be a valid email format.
- phone is normalized to 10 digits (US/Canada) and must contain exactly 10 digits
  when provided.
- address, city, state (2-char), and zip (US 5-digit) are required on create.

SellerUpdate applies per-field validation only (email/phone/state/zip format);
cross-field rules (name-vs-company, phone-or-email) are enforced on create since
a partial patch cannot be evaluated without the existing record state.
"""

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_ZIP_RE = re.compile(r"^\d{5}$")
_NON_DIGIT_RE = re.compile(r"\D")


def _normalize_email(v: Optional[str]) -> Optional[str]:
    if v is None or v.strip() == "":
        return None
    v = v.strip()
    if not _EMAIL_RE.match(v):
        raise ValueError("Invalid email format")
    return v


def _normalize_phone(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    digits = _NON_DIGIT_RE.sub("", v)
    if digits == "":
        return None
    if len(digits) != 10:
        raise ValueError("Phone must contain exactly 10 digits (US/Canada)")
    return digits


def _normalize_state(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    return v.strip().upper()


class SellerCreate(BaseModel):
    """Payload for registering a new seller (consignor or vendor) in the active event."""

    first_name: Optional[str] = Field(default=None, description="Seller's given name. Required for individuals; omitted for vendors.")
    last_name: Optional[str] = Field(default=None, description="Seller's family name. Required for individuals; omitted for vendors.")
    company: Optional[str] = Field(default=None, description="Company or organization name. Required for vendors.")
    is_vendor: bool = Field(default=False, description="True if this seller is a commercial vendor rather than an individual consignor.")
    email: Optional[str] = Field(default=None, description="Seller's email address. At least one of email/phone is required.")
    phone: Optional[str] = Field(default=None, description="Seller's contact phone number (10 digits, US/Canada). At least one of email/phone is required.")
    address: str = Field(min_length=1, description="Street address. Required.")
    city: str = Field(min_length=1, description="City. Required.")
    state: str = Field(min_length=2, max_length=2, description="Two-letter US state abbreviation. Required.")
    zip: str = Field(pattern=_ZIP_RE, description="US 5-digit ZIP code. Required.")
    donate_unsold_default: bool = Field(
        default=False,
        description="Per-seller default for intake.donate_unsold; pre-populates new intakes.",
    )
    donate_proceeds_default: bool = Field(
        default=False,
        description="Per-seller default for intake.donate_proceeds; pre-populates new intakes.",
    )

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_email(v)

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_phone(v)

    @field_validator("state")
    @classmethod
    def _validate_state(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_state(v)

    @model_validator(mode="after")
    def _validate_name_or_company(self) -> "SellerCreate":
        if self.is_vendor:
            if not (self.company and self.company.strip()):
                raise ValueError("Company is required for vendor sellers")
        else:
            if not (self.first_name and self.first_name.strip()):
                raise ValueError("First name is required for individual sellers")
            if not (self.last_name and self.last_name.strip()):
                raise ValueError("Last name is required for individual sellers")
        return self

    @model_validator(mode="after")
    def _validate_contact(self) -> "SellerCreate":
        if not (self.email or self.phone):
            raise ValueError("At least one of phone or email is required")
        return self


class SellerUpdate(BaseModel):
    """Partial-update payload for modifying an existing seller record.

    Per-field format validation (email/phone/state/zip) is applied. Cross-field
    rules (name-vs-company, phone-or-email) are NOT enforced on partial updates
    because they depend on the existing record state; evaluate the resulting
    record after applying the patch if full-contract validation is required.
    """

    code: Optional[str] = Field(default=None, description="Updated seller code, if changing.")
    first_name: Optional[str] = Field(default=None, description="Updated given name, if changing.")
    last_name: Optional[str] = Field(default=None, description="Updated family name, if changing.")
    company: Optional[str] = Field(default=None, description="Updated company name, if changing.")
    is_vendor: Optional[bool] = Field(default=None, description="Updated vendor flag, if changing.")
    email: Optional[str] = Field(default=None, description="Updated email address, if changing.")
    phone: Optional[str] = Field(default=None, description="Updated phone number, if changing.")
    address: Optional[str] = Field(default=None, description="Updated street address, if changing.")
    city: Optional[str] = Field(default=None, description="Updated city, if changing.")
    state: Optional[str] = Field(default=None, description="Updated two-letter state abbreviation, if changing.")
    zip: Optional[str] = Field(default=None, description="Updated ZIP code, if changing.")
    donate_unsold_default: Optional[bool] = Field(default=None, description="Updated default for intake.donate_unsold, if changing.")
    donate_proceeds_default: Optional[bool] = Field(default=None, description="Updated default for intake.donate_proceeds, if changing.")

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_email(v)

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_phone(v)

    @field_validator("state")
    @classmethod
    def _validate_state(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_state(v)

    @field_validator("zip")
    @classmethod
    def _validate_zip(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if not _ZIP_RE.match(v):
            raise ValueError("ZIP code must be 5 digits")
        return v


class SellerResponse(BaseModel):
    """Read-only representation of a seller record returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the seller.")
    event_id: int = Field(description="ID of the event this seller is registered in.")
    code: str = Field(description="Unique alphanumeric seller code.")
    first_name: Optional[str] = Field(default=None, description="Seller's given name; null for vendor sellers that have no person name.")
    last_name: Optional[str] = Field(default=None, description="Seller's family name; null for vendor sellers that have no person name.")
    company: Optional[str] = Field(default=None, description="Company or organization name, if applicable.")
    is_vendor: bool = Field(description="True if this seller is a commercial vendor.")
    email: Optional[str] = Field(default=None, description="Seller's email address.")
    phone: Optional[str] = Field(default=None, description="Seller's contact phone number, normalized to 10 digits.")
    address: Optional[str] = Field(default=None, description="Street address for the seller's mailing address.")
    city: Optional[str] = Field(default=None, description="City for the seller's mailing address.")
    state: Optional[str] = Field(default=None, description="Two-letter US state abbreviation.")
    zip: Optional[str] = Field(default=None, description="US 5-digit ZIP code.")
    donate_unsold_default: bool = Field(description="Per-seller default pre-populating intake.donate_unsold.")
    donate_proceeds_default: bool = Field(description="Per-seller default pre-populating intake.donate_proceeds.")
    created_at: datetime = Field(description="UTC timestamp when the seller record was created.")