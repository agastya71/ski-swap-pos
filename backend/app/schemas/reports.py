"""Pydantic schemas for end-of-event and end-of-day report payloads."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class SellerPayoutLineItem(BaseModel):
    """A single item row within a seller's payout report."""

    item_code: str = Field(description="Unique item code identifying the consigned item.")
    description: Optional[str] = Field(default=None, description="Free-text description of the item.")
    quantity: float = Field(description="Original intake quantity of the item.")
    remaining: float = Field(description="On-hand units still available for sale.")
    price: float = Field(description="Original asking price set by the seller.")
    sell_price: float = Field(description="Actual price at which the item was sold (per unit).")
    status: str = Field(description="Final status of the item (e.g., 'sold', 'available', 'donated').")
    mysl_share: float = Field(description="MYSL commission for this item (0 for non-sold items).")
    seller_share: float = Field(description="Seller payout for this item (0 for non-sold items).")
    commission_rate: float = Field(description="Commission rate applied (or that would apply) to this item.")


class SellerPayoutReport(BaseModel):
    """Complete payout summary for a single seller at the close of an event."""

    event_id: int = Field(description="ID of the event this payout report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    seller_id: int = Field(description="ID of the seller this report is for.")
    seller_code: str = Field(description="Unique alphanumeric code identifying the seller.")
    seller_name: str = Field(description="Full name of the seller.")
    seller_email: Optional[str] = Field(default=None, description="Seller's email address, if on file.")
    items_consigned: int = Field(description="Total number of items the seller brought to the swap.")
    items_sold: int = Field(description="Number of the seller's items that were sold.")
    items_unsold: int = Field(description="Number of the seller's items that remain unsold.")
    items_donated: int = Field(description="Number of the seller's items that were donated.")
    gross_sales: float = Field(description="Total revenue generated from the seller's sold items.")
    mysl_total: float = Field(description="MYSL's commission share from this seller's sales.")
    seller_total: float = Field(description="Amount to be paid out to the seller after commission.")
    line_items: list[SellerPayoutLineItem] = Field(description="Itemized breakdown of every consigned item and its outcome.")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


class EventRevenueReport(BaseModel):
    """Aggregate revenue summary for an entire swap event."""

    event_id: int = Field(description="ID of the event this revenue report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    event_year: int = Field(description="Calendar year of the event.")
    total_sales: int = Field(description="Total number of completed (non-voided) sale transactions.")
    voided_sales: int = Field(description="Number of sale transactions that were voided.")
    gross_revenue: float = Field(description="Total revenue from all non-voided sales.")
    mysl_total: float = Field(description="Total commission amount retained by MYSL across all sales.")
    seller_total: float = Field(description="Total payout amount owed to all sellers across all sales.")
    cash_total: float = Field(description="Total amount collected in cash across all sales.")
    check_total: float = Field(description="Total amount collected by check across all sales.")
    cc_total: float = Field(description="Total amount collected by credit/debit card across all sales.")
    donate_proceeds_total: float = Field(description="Total seller proceeds that were donated rather than paid out.")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


class DonationItem(BaseModel):
    """A single item row within the donations report."""

    seller_code: str = Field(description="Code of the seller who consigned this donated item.")
    seller_name: str = Field(description="Full name of the seller who consigned this donated item.")
    item_code: str = Field(description="Unique item code identifying the donated item.")
    description: Optional[str] = Field(default=None, description="Free-text description of the donated item.")
    quantity: float = Field(description="Original intake quantity of the donated item.")
    remaining: float = Field(description="On-hand units still not sold (donated units for unsold-type donations).")
    price: float = Field(description="Original asking price of the donated item.")
    donation_type: str = Field(description="Reason for donation: 'proceeds' (seller donated payout) or 'unsold' (seller donated unsold item).")


class DonationsReport(BaseModel):
    """Summary of all items and proceeds donated during a swap event."""

    event_id: int = Field(description="ID of the event this donations report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    items: list[DonationItem] = Field(description="All items (or proceeds) donated during the event.")
    total_items: int = Field(description="Total count of donation entries in this report.")
    total_value: float = Field(description="Combined value of all donated items and proceeds.")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


class UnsoldItem(BaseModel):
    """A single item row within the unsold items report."""

    seller_code: str = Field(description="Code of the seller who consigned this unsold item.")
    seller_name: str = Field(description="Full name of the seller who consigned this unsold item.")
    item_code: str = Field(description="Unique item code identifying the unsold item.")
    description: Optional[str] = Field(default=None, description="Free-text description of the unsold item.")
    category: Optional[str] = Field(default=None, description="Merchandise category of the unsold item.")
    quantity: float = Field(description="Original intake quantity of the unsold item.")
    remaining: float = Field(description="On-hand units not sold (all unsold items have remaining > 0).")
    price: float = Field(description="Asking price of the unsold item.")


class UnsoldItemsReport(BaseModel):
    """Summary of all items that were not sold during a swap event."""

    event_id: int = Field(description="ID of the event this unsold items report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    items: list[UnsoldItem] = Field(description="All items that remained unsold at the close of the event.")
    total_items: int = Field(description="Total count of unsold items in this report.")
    total_value: float = Field(description="Combined asking price of all unsold items.")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


class EndOfDayReport(BaseModel):
    """Cumulative event sales summary stamped with the date the report was generated."""

    event_id: int = Field(description="ID of the event this end-of-day report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    date_generated: date = Field(description="Calendar date this end-of-day report was generated.")
    sales_count: int = Field(description="Total number of non-voided sale transactions across all event days.")
    voided_count: int = Field(description="Total number of voided sale transactions across all event days.")
    gross_revenue: float = Field(description="Total revenue from all non-voided sales across all event days.")
    mysl_total: float = Field(description="MYSL commission from all non-voided sales across all event days.")
    seller_total: float = Field(description="Seller payout amounts from all non-voided sales across all event days.")
    cash_total: float = Field(description="Total cash collected across all event days.")
    check_total: float = Field(description="Total check payments collected across all event days.")
    cc_total: float = Field(description="Total credit/debit card payments collected across all event days.")
    generated_at: datetime = Field(description="UTC timestamp when this end-of-day report was generated.")
