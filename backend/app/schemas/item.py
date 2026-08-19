"""Pydantic schemas for inventory item creation, update, response, and POS lookup."""

import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ItemCreate(BaseModel):
    """Payload for adding a new consigned item to an intake session. Item code is auto-generated."""

    category: Optional[str] = Field(default=None, description="High-level merchandise category (e.g., 'Skis', 'Boots', 'Apparel').")
    brand: str = Field(min_length=1, description="Manufacturer or brand name. Required.")
    type: Optional[str] = Field(default=None, description="Sub-type within the category (e.g., 'Alpine', 'Nordic').")
    description: Optional[str] = Field(default=None, description="Free-text description of the item as it will appear on the label.")
    color: Optional[str] = Field(default=None, description="Color or color combination of the item.")
    size: Optional[str] = Field(default=None, description="Size of the item (length, boot size, clothing size, etc.).")
    uom: Optional[str] = Field(default=None, description="Unit of measure (e.g., 'pair', 'each').")
    gender_age: Optional[str] = Field(default=None, description="Target gender/age group (e.g., 'Men', 'Women', 'Youth').")
    year: Optional[int] = Field(default=None, description="Model year of the item, if known.")
    used: bool = Field(default=True, description="True if the item is used/pre-owned; False if new.")
    price: float = Field(description="Asking price set by the seller in dollars.")
    quantity: float = Field(default=1.0, description="Number of units represented by this item record (usually 1).")
    barcode_39: Optional[str] = Field(default=None, description="Code 39 barcode string to print on the item label. Defaults to the auto-generated item code if omitted.")
    label_line_2: Optional[str] = Field(default=None, description="Second custom text line printed on the item label.")
    label_line_3: Optional[str] = Field(default=None, description="Third custom text line printed on the item label.")
    donate_unsold: Optional[bool] = Field(default=None, description="If True, this specific item will be donated if it does not sell. Omit (null) to inherit the intake's donate_unsold.")
    vendor_item_id: Optional[str] = Field(default=None, description="External item identifier supplied by a commercial vendor.")


class ItemUpdate(BaseModel):
    """Partial-update payload for modifying an existing inventory item."""

    category: Optional[str] = Field(default=None, description="Updated merchandise category, if changing.")
    brand: Optional[str] = Field(default=None, description="Updated brand name, if changing.")
    type: Optional[str] = Field(default=None, description="Updated sub-type, if changing.")
    description: Optional[str] = Field(default=None, description="Updated item description, if changing.")
    color: Optional[str] = Field(default=None, description="Updated color, if changing.")
    size: Optional[str] = Field(default=None, description="Updated size, if changing.")
    uom: Optional[str] = Field(default=None, description="Updated unit of measure, if changing.")
    gender_age: Optional[str] = Field(default=None, description="Updated gender/age group, if changing.")
    year: Optional[int] = Field(default=None, description="Updated model year, if changing.")
    used: Optional[bool] = Field(default=None, description="Updated condition flag, if changing.")
    price: Optional[float] = Field(default=None, description="Updated asking price in dollars, if changing.")
    quantity: Optional[float] = Field(default=None, description="Updated quantity, if changing.")
    barcode_39: Optional[str] = Field(default=None, description="Updated barcode string, if changing.")
    label_line_2: Optional[str] = Field(default=None, description="Updated second label line, if changing.")
    label_line_3: Optional[str] = Field(default=None, description="Updated third label line, if changing.")
    donate_unsold: Optional[bool] = Field(default=None, description="Updated donation preference for this item, if changing.")
    vendor_item_id: Optional[str] = Field(default=None, description="Updated vendor item identifier, if changing.")


class ItemQuantityAdjustment(BaseModel):
    """Payload for adjusting an item's on-hand quantity by a signed delta.

    Positive values increase the quantity by the given difference (not a new
    total). Negative values decrease it; the resulting quantity may not fall
    below the number of units already sold (sum of non-voided sale_item
    quantities for this item).
    """

    adjustment: int = Field(description="Signed integer to add to (or subtract from) the current quantity.")


class ItemResponse(BaseModel):
    """Read-only representation of an inventory item returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the item.")
    intake_id: int = Field(description="ID of the intake session this item belongs to.")
    seller_id: int = Field(description="ID of the seller who consigned this item.")
    code: str = Field(description="Unique item code printed on the price tag.")
    category: Optional[str] = Field(default=None, description="High-level merchandise category.")
    brand: Optional[str] = Field(default=None, description="Manufacturer or brand name.")
    type: Optional[str] = Field(default=None, description="Sub-type within the category.")
    description: Optional[str] = Field(default=None, description="Free-text description of the item.")
    color: Optional[str] = Field(default=None, description="Color or color combination of the item.")
    size: Optional[str] = Field(default=None, description="Size of the item.")
    uom: Optional[str] = Field(default=None, description="Unit of measure.")
    gender_age: Optional[str] = Field(default=None, description="Target gender/age group.")
    year: Optional[int] = Field(default=None, description="Model year of the item.")
    used: bool = Field(description="True if the item is used/pre-owned.")
    price: float = Field(description="Asking price set by the seller in dollars.")
    quantity: float = Field(description="Number of units represented by this item record.")
    barcode_39: Optional[str] = Field(default=None, description="Code 39 barcode string printed on the label.")
    label_line_2: Optional[str] = Field(default=None, description="Second custom text line on the item label.")
    label_line_3: Optional[str] = Field(default=None, description="Third custom text line on the item label.")
    donate_unsold: bool = Field(description="Whether this item will be donated if unsold.")
    status: str = Field(description="Current lifecycle status of the item (e.g., 'available', 'sold', 'donated', 'returned').")
    label_printed: bool = Field(description="Whether a price label has been printed for this item.")
    is_deleted: bool = Field(default=False, description="True if the item has been soft-deleted and is excluded from listings/checkout.")
    vendor_item_id: Optional[str] = Field(default=None, description="External item identifier supplied by a commercial vendor.")
    created_at: datetime.datetime = Field(description="UTC timestamp when the item record was created.")


class ItemLookupResponse(ItemResponse):
    """Extended item response used by the POS cashier lookup, adding the seller code for display."""

    seller_code: str = Field(description="Seller code associated with this item, included for quick cashier reference.")


class ImportRowError(BaseModel):
    """Describes a single skipped row from an Excel import."""

    row: int = Field(description="1-based row number in the uploaded file (header = row 1).")
    reason: str = Field(description="Human-readable explanation of why the row was skipped.")


class ImportResult(BaseModel):
    """Summary returned after a bulk Excel item import."""

    imported: int = Field(description="Number of items successfully created.")
    skipped: int = Field(description="Number of rows skipped due to validation errors.")
    errors: list[ImportRowError] = Field(description="Details of each skipped row.")
