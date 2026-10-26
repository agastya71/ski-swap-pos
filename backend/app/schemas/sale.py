"""Pydantic schemas for sale transaction creation, line items, and response."""

import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SaleItemCreate(BaseModel):
    """Payload for a single line item being added to a new sale."""

    item_id: int = Field(description="ID of the inventory item being sold.")
    quantity: int = Field(default=1, ge=1, description="Number of units to sell; must not exceed the item's remaining quantity.")
    sell_price: Optional[float] = Field(
        default=None,
        description="Override per-unit sell price; uses the item's listed price if omitted.",
    )
    notes: Optional[str] = Field(default=None, description="Cashier notes specific to this line item (e.g., price negotiation reason).")


class SaleCreate(BaseModel):
    """Payload for creating a new sale transaction at the point of sale."""

    customer_name: Optional[str] = Field(default=None, description="Buyer's name, recorded optionally for receipt or reference.")
    customer_email: Optional[str] = Field(default=None, description="Buyer's email address, used for receipt delivery if provided.")
    notes: Optional[str] = Field(default=None, description="General cashier notes about the transaction.")
    cash_amount: float = Field(default=0.0, description="Amount tendered by the buyer in cash.")
    check_amount: float = Field(default=0.0, description="Amount tendered by the buyer by check.")
    check_number: Optional[str] = Field(default=None, description="Check number for the check tender, if applicable.")
    cc_amount: float = Field(default=0.0, description="Amount tendered by the buyer by credit/debit card.")
    cc_transaction_id: Optional[str] = Field(default=None, description="Card transaction/reference id when available (e.g., from a payment terminal); optional — manual credit-card tender does not require one.")
    items: list[SaleItemCreate] = Field(description="One or more line items included in this sale; must not be empty.")

    @field_validator("items")
    @classmethod
    def items_not_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("items list must not be empty")
        return v

    @model_validator(mode="after")
    def _validate_payment_ids(self) -> "SaleCreate":
        if self.check_amount > 0 and not (self.check_number and self.check_number.strip()):
            raise ValueError("check_number is required when check_amount > 0")
        # cc_transaction_id is intentionally optional: credit-card tender is
        # recorded manually for now; the Square integration (pending) will
        # supply transaction ids later.
        return self


class SaleItemResponse(BaseModel):
    """Read-only representation of a single line item within a completed sale."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the sale line item.")
    sale_id: int = Field(description="ID of the parent sale this line item belongs to.")
    item_id: int = Field(description="ID of the inventory item that was sold.")
    line_number: Optional[int] = Field(default=None, description="Sequential line number within the sale receipt.")
    quantity: float = Field(description="Number of units sold on this line (typically 1).")
    sell_price: float = Field(description="Per-unit price at which the item was sold.")
    extended_price: float = Field(description="Total price for this line (sell_price * quantity).")
    notes: Optional[str] = Field(default=None, description="Cashier notes specific to this line item.")
    item_code: Optional[str] = Field(default=None, description="Item code (denormalized for read-only receipt/report display).")
    created_at: datetime.datetime = Field(description="UTC timestamp when this line item record was created.")


class SaleResponse(BaseModel):
    """Read-only representation of a completed sale transaction returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the sale.")
    event_id: int = Field(description="ID of the active event this sale was made under.")
    date_of_sale: Optional[datetime.datetime] = Field(default=None, description="Full timestamp at which the sale occurred.")
    customer_name: Optional[str] = Field(default=None, description="Buyer's name, if recorded.")
    customer_email: Optional[str] = Field(default=None, description="Buyer's email address, if recorded.")
    sale_total: float = Field(description="Sum of all line item extended prices (gross sale amount).")
    mysl_total: float = Field(description="Portion of the sale total retained by MYSL as commission.")
    seller_total: float = Field(description="Portion of the sale total to be paid out to sellers.")
    cash_amount: float = Field(description="Amount paid in cash.")
    check_amount: float = Field(description="Amount paid by check.")
    cc_amount: float = Field(description="Amount paid by credit/debit card.")
    check_number: Optional[str] = Field(default=None, description="Check number, if payment included a check.")
    cc_transaction_id: Optional[str] = Field(default=None, description="Square transaction id / card reference, if payment was by card.")
    total_paid: float = Field(description="Total amount actually tendered (cash + check + cc).")
    balance_due: float = Field(description="Remaining balance after subtracting total_paid from sale_total (should be 0 for settled transactions).")
    notes: Optional[str] = Field(default=None, description="General cashier notes about the transaction.")
    is_voided: bool = Field(default=False, description="True if this sale has been voided and its items returned to available status.")
    created_at: datetime.datetime = Field(description="UTC timestamp when the sale record was created.")
    created_by: Optional[str] = Field(default=None, description="Username of the cashier who processed this sale.")


class SaleWithItemsResponse(SaleResponse):
    """Extended sale response that includes the full list of line items."""

    sale_items: list[SaleItemResponse] = Field(
        default=[],
        description="All line items included in this sale transaction.",
    )


class SaleLineEdit(BaseModel):
    """Payload for editing one existing line of a completed sale (transaction
    editing). Omitted fields are left unchanged."""

    quantity: Optional[int] = Field(default=None, ge=1, description="New number of units for this line; must not exceed the item's remaining on-hand units (when increasing) and must not re-stock beyond the intake quantity (when decreasing).")
    sell_price: Optional[float] = Field(default=None, ge=0, description="New per-unit price for this line (0 allowed for a free item).")
    notes: Optional[str] = Field(default=None, description="Replacement cashier notes for this line.")


class SaleUpdate(BaseModel):
    """Payload for editing the payment/customer fields of a completed sale.

    Omitted fields are left unchanged. Payment amounts are re-tendered as a
    whole: total_paid and balance_due are recomputed on save.
    """

    customer_name: Optional[str] = Field(default=None, description="Replacement buyer name, or an empty string to clear it.")
    customer_email: Optional[str] = Field(default=None, description="Replacement buyer email, or an empty string to clear it.")
    notes: Optional[str] = Field(default=None, description="Replacement general notes, or an empty string to clear them.")
    cash_amount: Optional[float] = Field(default=None, ge=0, description="Replacement cash tender.")
    check_amount: Optional[float] = Field(default=None, ge=0, description="Replacement check tender.")
    check_number: Optional[str] = Field(default=None, description="Replacement/updated check number; required when check_amount > 0.")
    cc_amount: Optional[float] = Field(default=None, ge=0, description="Replacement card tender.")
    cc_transaction_id: Optional[str] = Field(default=None, description="Replacement card transaction/reference id.")


class SaleEditResponse(BaseModel):
    """One audited edit action on a sale (newest-first in sale history)."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the audit row.")
    sale_id: int = Field(description="ID of the edited sale.")
    sale_item_id: Optional[int] = Field(default=None, description="Sale-line reference at edit time; may point at a line that has since been removed.")
    action: str = Field(description="Edit action: add_line, update_line, remove_line, update_payments, or update_info.")
    before: Optional[dict] = Field(default=None, description="Snapshot of the affected line/fields before the change (None for add_line).")
    after: Optional[dict] = Field(default=None, description="Snapshot after the change (None for remove_line).")
    edited_by: str = Field(description="Username that performed the edit.")
    edited_at: datetime.datetime = Field(description="UTC timestamp of the edit.")
