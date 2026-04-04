import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class SaleItemCreate(BaseModel):
    item_id: int
    sell_price: Optional[float] = None
    notes: Optional[str] = None


class SaleCreate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    notes: Optional[str] = None
    cash_amount: float = 0.0
    check_amount: float = 0.0
    check_number: Optional[str] = None
    cc_amount: float = 0.0
    items: list[SaleItemCreate]

    @field_validator("items")
    @classmethod
    def items_not_empty(cls, v: list) -> list:
        if not v:
            raise ValueError("items list must not be empty")
        return v


class SaleItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sale_id: int
    item_id: int
    line_number: Optional[int] = None
    quantity: float
    sell_price: float
    extended_price: float
    notes: Optional[str] = None
    created_at: datetime.datetime


class SaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: int
    date_of_sale: Optional[datetime.date] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    sale_total: float
    mysl_total: float
    seller_total: float
    cash_amount: float
    check_amount: float
    cc_amount: float
    check_number: Optional[str] = None
    total_paid: float
    balance_due: float
    notes: Optional[str] = None
    created_at: datetime.datetime
    created_by: Optional[str] = None


class SaleWithItemsResponse(SaleResponse):
    sale_items: list[SaleItemResponse] = []
