from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class SellerPayoutLineItem(BaseModel):
    item_code: str
    description: Optional[str] = None
    price: float
    sell_price: float
    status: str


class SellerPayoutReport(BaseModel):
    event_id: int
    event_name: str
    seller_id: int
    seller_code: str
    seller_name: str
    seller_email: Optional[str] = None
    items_consigned: int
    items_sold: int
    items_unsold: int
    items_donated: int
    gross_sales: float
    mysl_total: float
    seller_total: float
    line_items: list[SellerPayoutLineItem]
    generated_at: datetime


class EventRevenueReport(BaseModel):
    event_id: int
    event_name: str
    event_year: int
    total_sales: int
    voided_sales: int
    gross_revenue: float
    mysl_total: float
    seller_total: float
    cash_total: float
    check_total: float
    cc_total: float
    donate_proceeds_total: float
    generated_at: datetime


class DonationItem(BaseModel):
    seller_code: str
    item_code: str
    description: Optional[str] = None
    price: float
    donation_type: str  # "proceeds" | "unsold"


class DonationsReport(BaseModel):
    event_id: int
    event_name: str
    items: list[DonationItem]
    total_items: int
    total_value: float
    generated_at: datetime


class UnsoldItem(BaseModel):
    seller_code: str
    item_code: str
    description: Optional[str] = None
    category: Optional[str] = None
    price: float


class UnsoldItemsReport(BaseModel):
    event_id: int
    event_name: str
    items: list[UnsoldItem]
    total_items: int
    total_value: float
    generated_at: datetime


class EndOfDayReport(BaseModel):
    event_id: int
    event_name: str
    date_generated: date
    sales_count: int
    voided_count: int
    gross_revenue: float
    mysl_total: float
    seller_total: float
    cash_total: float
    check_total: float
    cc_total: float
    generated_at: datetime
