"""Pydantic schemas for end-of-event and end-of-day report payloads."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class SellerPayoutSellerInfo(BaseModel):
    """Seller contact and settlement details shown on the payout report."""

    seller_code: str = Field(description="Unique alphanumeric code identifying the seller.")
    seller_name: str = Field(description="Full name of the seller (or company for vendors).")
    company: Optional[str] = Field(default=None, description="Company name for vendor sellers.")
    is_vendor: bool = Field(description="True when the seller is a commercial vendor.")
    email: Optional[str] = Field(default=None, description="Seller's email address, if on file.")
    phone: Optional[str] = Field(default=None, description="Seller's phone number, if on file.")
    address: Optional[str] = Field(default=None, description="Seller's street address, if on file.")
    city: Optional[str] = Field(default=None, description="Seller's city, if on file.")
    state: Optional[str] = Field(default=None, description="Seller's state, if on file.")
    zip: Optional[str] = Field(default=None, description="Seller's ZIP code, if on file.")
    commission_rate: float = Field(description="Commission rate applied to this seller's sales.")


class SellerPayoutSaleLine(BaseModel):
    """A single sold-item row within the SALES section of a seller's payout."""

    item_code: str = Field(description="Unique item code identifying the consigned item.")
    description: Optional[str] = Field(default=None, description="Free-text description of the item.")
    date_of_sale: Optional[datetime] = Field(default=None, description="Timestamp of the sale transaction.")
    quantity_sold: float = Field(description="Units of the item sold in this transaction line.")
    sell_price: float = Field(description="Actual price at which the item was sold (per unit).")
    extended_price: float = Field(description="Quantity sold x sell price for this transaction line.")
    mysl_share: float = Field(description="MYSL commission for this sale line.")
    seller_share: float = Field(description="Seller payout for this sale line.")
    commission_rate: float = Field(description="Commission rate applied to this sale line.")


class SellerPayoutUnsoldLine(BaseModel):
    """A single row within the UNSOLD ITEMS section of a seller's payout report."""

    item_code: str = Field(description="Unique item code identifying the consigned item.")
    description: Optional[str] = Field(default=None, description="Free-text description of the item.")
    quantity: float = Field(description="Original intake quantity of the item.")
    remaining: float = Field(description="On-hand units still available for sale.")
    price: float = Field(description="Original asking price set by the seller.")
    status: str = Field(description="Current status of the item (e.g., 'available', 'donated', 'returned').")
    donate_unsold: bool = Field(description="True when the seller elected to donate this item if unsold.")
    mysl_share: float = Field(default=0.0, description="MYSL commission for this item (always 0 for unsold items).")
    seller_share: float = Field(default=0.0, description="Seller payout for this item (always 0 for unsold items).")
    commission_rate: float = Field(description="Commission rate that would apply if this item sold.")


class SellerPayoutReport(BaseModel):
    """Complete payout summary for a single seller at the close of an event.

    Structured in two detail sections: ``sales`` (every sold unit, with the
    sale transaction line, prices, and commission shares) and
    ``unsold_items`` (every item still on hand at close, including donated
    and returned items).
    """

    event_id: int = Field(description="ID of the event this payout report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    seller_id: int = Field(description="ID of the seller this report is for.")
    seller_code: str = Field(description="Unique alphanumeric code identifying the seller.")
    seller_name: str = Field(description="Full name of the seller.")
    seller_email: Optional[str] = Field(default=None, description="Seller's email address, if on file.")
    seller_info: SellerPayoutSellerInfo = Field(description="Seller contact and settlement details.")
    items_consigned: int = Field(description="Total number of items the seller brought to the swap.")
    items_sold: int = Field(description="Number of the seller's items that were sold.")
    items_unsold: int = Field(description="Number of the seller's items that remain unsold.")
    items_donated: int = Field(description="Number of the seller's items that were donated.")
    gross_sales: float = Field(description="Total revenue generated from the seller's sold items.")
    mysl_total: float = Field(description="MYSL's commission share from this seller's sales.")
    seller_total: float = Field(description="Amount to be paid out to the seller after commission.")
    sales: list[SellerPayoutSaleLine] = Field(description="SALES section: every non-voided sale line for this seller's items.")
    unsold_items: list[SellerPayoutUnsoldLine] = Field(description="UNSOLD ITEMS section: every item still on hand (available, donated, or returned).")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


class SellersPayoutsReport(BaseModel):
    """Payout reports for ALL sellers in an event, plus grand totals."""

    event_id: int = Field(description="ID of the event this report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    seller_count: int = Field(description="Number of sellers included in this report.")
    gross_sales_total: float = Field(description="Sum of every seller's gross sales.")
    mysl_total: float = Field(description="Grand total MYSL commission across all sellers.")
    seller_total: float = Field(description="Grand total payable to all sellers.")
    sellers: list[SellerPayoutReport] = Field(description="Per-seller payout reports (one entry per seller, sorted by code).")
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


class TransactionRow(BaseModel):
    """A single sale transaction, for the transactions-by-user listing."""

    sale_id: int = Field(description="Unique ID of the sale.")
    cashier: str = Field(description="Login name of the user who completed (or last actioned) this sale; stored on sale.created_by.")
    date_of_sale: Optional[datetime] = Field(default=None, description="Full timestamp of the transaction; null if not recorded.")
    items_count: int = Field(description="Number of line items on this sale.")
    units_sold: int = Field(description="Total units sold across all line items on this sale.")
    sale_total: float = Field(description="Extended price total for this sale.")
    mysl_total: float = Field(description="MYSL commission for this sale.")
    seller_total: float = Field(description="Seller payout for this sale.")
    cash_amount: float = Field(description="Amount tendered in cash.")
    check_amount: float = Field(description="Amount tendered by check.")
    cc_amount: float = Field(description="Amount tendered by credit/debit card.")
    is_voided: bool = Field(description="True if this sale has been voided.")


class UserSalesSummary(BaseModel):
    """Per-cashier aggregation of the transactions that user recorded."""

    cashier: str = Field(description="Login name recorded on sale.created_by ('(unknown)' when not stored).")
    transactions: list[TransactionRow] = Field(description="This user's transactions, newest first (voided ones flagged).")
    sales_count: int = Field(description="Number of non-voided sales recorded by this user.")
    voided_count: int = Field(description="Number of voided sales recorded by this user.")
    gross_sales: float = Field(description="Sum of sale totals for non-voided sales only.")
    mysl_total: float = Field(description="MYSL share for non-voided sales.")
    seller_total: float = Field(description="Seller share for non-voided sales.")
    cash_total: float = Field(description="Cash tendered on non-voided sales.")
    check_total: float = Field(description="Check tender on non-voided sales.")
    cc_total: float = Field(description="Card tender on non-voided sales.")


class TransactionsByUserReport(BaseModel):
    """Report listing every event transaction grouped by the user who recorded it."""

    event_id: int = Field(description="ID of the event this report covers.")
    event_name: str = Field(description="Name of the event.")
    users: list[UserSalesSummary] = Field(description="One entry per cashier (sale.created_by), sorted by cashier name.")
    total_sales: int = Field(description="Total non-voided sales across all users.")
    total_voided: int = Field(description="Total voided sales across all users.")
    gross_sales: float = Field(description="Total non-voided revenue across all users.")
    mysl_total: float = Field(description="Total MYSL share across all users (non-voided).")
    seller_total: float = Field(description="Total seller share across all users (non-voided).")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")
