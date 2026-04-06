"""Pydantic schemas for sale transaction creation, line items, and response."""

import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SaleItemCreate(BaseModel):
    """Payload for a single line item being added to a new sale."""

    item_id: int = Field(description="ID of the inventory item being sold.")
    sell_price: Optional[float] = Field(
        default=None,
        description="Override sell price for this item; uses the item's listed price if omitted.",
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
    items: list[SaleItemCreate] = Field(description="One or more line items included in this sale; must not be empty.")

    @field_validator("items")
    @classmethod
    def items_not_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("items list must not be empty")
        return v


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
    created_at: datetime.datetime = Field(description="UTC timestamp when this line item record was created.")


class SaleResponse(BaseModel):
    """Read-only representation of a completed sale transaction returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(description="Auto-generated primary key for the sale.")
    event_id: int = Field(description="ID of the active event this sale was made under.")
    date_of_sale: Optional[datetime.date] = Field(default=None, description="Calendar date on which the sale occurred.")
    customer_name: Optional[str] = Field(default=None, description="Buyer's name, if recorded.")
    customer_email: Optional[str] = Field(default=None, description="Buyer's email address, if recorded.")
    sale_total: float = Field(description="Sum of all line item extended prices (gross sale amount).")
    mysl_total: float = Field(description="Portion of the sale total retained by MYSL as commission.")
    seller_total: float = Field(description="Portion of the sale total to be paid out to sellers.")
    cash_amount: float = Field(description="Amount paid in cash.")
    check_amount: float = Field(description="Amount paid by check.")
    cc_amount: float = Field(description="Amount paid by credit/debit card.")
    check_number: Optional[str] = Field(default=None, description="Check number, if payment included a check.")
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
