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
    category: Optional[str] = Field(default=None, description="Canonical category (e.g. 'Skis'); null when not recorded.")
    type: Optional[str] = Field(default=None, description="Item type (e.g. 'Skate'); null when not recorded.")
    brand: Optional[str] = Field(default=None, description="Manufacturer brand; null when not recorded.")
    date_of_sale: Optional[datetime] = Field(default=None, description="Timestamp of the sale transaction (retained in JSON; not rendered in the Sales Detail tables).")
    quantity_sold: float = Field(description="Units of the item sold in this transaction line.")
    sell_price: float = Field(description="Actual price at which the item was sold (per unit).")
    extended_price: float = Field(description="Quantity sold x sell price for this transaction line.")
    price_adjustment_reason: Optional[str] = Field(
        default=None,
        description="Cashier's reason for selling below/above the listed price (sale_item.notes); None when the price was not adjusted.",
    )
    mysl_share: float = Field(description="MYSL commission for this sale line.")
    seller_share: float = Field(description="Seller payout for this sale line.")
    commission_rate: float = Field(description="Commission rate applied to this sale line.")


class SellerPayoutItemLine(BaseModel):
    """One row of the seller payout's single ITEM list.

    Mirrors the intake worksheet layout (category / brand / description /
    size / sell price) plus the item code, for EVERY consigned item — sold
    and unsold — with the original and remaining quantity columns.
    """

    item_code: str = Field(description="Unique item code identifying the consigned item.")
    category: Optional[str] = Field(default=None, description="Canonical category (e.g. 'Skis'); null when not recorded.")
    brand: Optional[str] = Field(default=None, description="Manufacturer brand; null when not recorded.")
    description: Optional[str] = Field(default=None, description="Free-text description of the item.")
    size: Optional[str] = Field(default=None, description="Item size (cm, EU, S/M/L, …); null when not recorded.")
    price: float = Field(description="Listed (asking) price per unit set at intake.")
    quantity: float = Field(description="Original intake quantity of the item.")
    remaining: float = Field(description="On-hand units still available for sale.")


class SellerPayoutReport(BaseModel):
    """Complete payout summary for a single seller at the close of an event.

    Structured in two detail sections: ``items`` — a SINGLE list of every
    consigned item (sold and unsold) in the intake worksheet layout with
    original + remaining quantity columns — and ``sales`` (the retained sale
    detail: transaction lines with dates, prices, and commission shares).
    """

    event_id: int = Field(description="ID of the event this payout report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    seller_id: int = Field(description="ID of the seller this report is for.")
    seller_code: str = Field(description="Unique alphanumeric code identifying the seller.")
    seller_name: str = Field(description="Full name of the seller.")
    seller_email: Optional[str] = Field(default=None, description="Seller's email address, if on file.")
    seller_info: SellerPayoutSellerInfo = Field(description="Seller contact and settlement details.")
    items_consigned: int = Field(description="Total UNITS consigned (sum of item quantities; an item with quantity 2 counts as 2).")
    items_sold: int = Field(description="Total units taken (consigned quantity − remaining, across consigned items).")
    items_unsold: int = Field(description="Total units still unsold (sum of remaining on non-donated statuses).")
    items_donated: int = Field(description="Total units whose status is 'donated'.")
    gross_sales: float = Field(description="Total revenue generated from the seller's sold items.")
    mysl_total: float = Field(description="MYSL's commission share from this seller's sales.")
    seller_total: float = Field(description="Amount to be paid out to the seller after commission.")
    items: list[SellerPayoutItemLine] = Field(description="ITEMS section (single list in worksheet layout): every consigned item with original + remaining quantities, sorted by item code.")
    sales: list[SellerPayoutSaleLine] = Field(description="Sales detail: every non-voided sale line for this seller's items.")
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
    exempt_seller_codes: list[str] = Field(
        description="Seller codes exempt from commission for this event (empty if none)."
    )
    exempt_lines_total: float = Field(
        description=(
            "Sum of extended prices sold by commission-exempt sellers (e.g. MYSL's own "
            "MYSL2 stall). Excluded from seller_total and mysl_total; paid in full to the exempt seller."
        )
    )
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
    donate_unsold: bool = Field(description="Whether the consignor elected to donate this item if it does not sell.")


class UnsoldItemsReport(BaseModel):
    """Summary of all items that were not sold during a swap event."""

    event_id: int = Field(description="ID of the event this unsold items report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    items: list[UnsoldItem] = Field(description="All items that remained unsold at the close of the event.")
    total_items: int = Field(description="Total count of unsold items in this report.")
    total_value: float = Field(description="Combined asking price of all unsold items.")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


class VendorCategoryLine(BaseModel):
    """Aggregated per-equipment-type row of a vendor's equipment summary."""

    category: str = Field(description="Equipment type (item.category); '(uncategorized)' when blank.")
    items_consigned: int = Field(description="Distinct items consigned in this category.")
    units_sold: float = Field(description="Units sold in this category.")
    gross_sales: float = Field(description="Extended-price revenue for this category.")
    mysl_share: float = Field(description="MYSL commission for this category (donate-proceeds lines send everything to MYSL).")
    seller_share: float = Field(description="Vendor payout for this category.")
    units_unsold: float = Field(description="Units still on hand (remaining) in this category.")
    unsold_value: float = Field(description="Asking-price value of the on-hand units.")


class VendorEquipmentSummaryReport(BaseModel):
    """Per-vendor sales summary grouped by equipment type (item.category).

    Generated on demand by an admin for a VENDOR seller — e.g. "how many
    skate skis did they sell". Refuses non-vendor sellers (422).
    """

    event_id: int = Field(description="ID of the event this report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    seller_code: str = Field(description="Unique alphanumeric code identifying the vendor.")
    seller_name: str = Field(description="Full name of the vendor (company for vendor sellers).")
    company: Optional[str] = Field(default=None, description="Company name for vendor sellers.")
    vendor_commission_rate: float = Field(description="Commission rate applied to this vendor's sales.")
    categories: list[VendorCategoryLine] = Field(description="One row per equipment type, sorted by category name.")
    total: VendorCategoryLine = Field(description="Grand totals across all categories (category='TOTAL').")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


class VendorSalesItemRow(BaseModel):
    """One item row of a vendor's block in the vendor-sales workbook.

    Mirrors the legacy 'Retailer_Sales' sheet (2025): intake fields plus
    sold/unsold/due columns. Sell Price is the average ACHIEVED price
    (Sell Extend ÷ Qty Sold); Due Seller applies the event's vendor
    commission rules (donate-proceeds > exemption > vendor rate).
    """

    seller_code: str = Field(description="Unique code identifying the vendor (repeated on every row).")
    item_code: str = Field(description="Item's label/lookup code (Item ID in the legacy sheet).")
    brand: Optional[str] = Field(default=None, description="Manufacturer brand; null when not recorded.")
    type: Optional[str] = Field(default=None, description="Item type (e.g. 'Skate'); null when not recorded.")
    category: Optional[str] = Field(default=None, description="Canonical category (e.g. 'Skis'); null when not recorded.")
    size: Optional[str] = Field(default=None, description="Item size (cm, EU, S/M/L, …); null when not recorded.")
    description: Optional[str] = Field(default=None, description="Free-text description of the item.")
    qty_in: float = Field(description="Original intake quantity of the item.")
    price: float = Field(description="Listed (asking) price per unit set at intake.")
    extend: float = Field(description="Qty In × Price (full consigned value).")
    qty_sold: float = Field(description="Units sold across all non-voided sales.")
    sell_price: float = Field(description="Average achieved unit price (Sell Extend ÷ Qty Sold; 0 when nothing sold).")
    sell_extend: float = Field(description="Sum of extended prices achieved on sold units.")
    due_seller: float = Field(description="Seller's proceeds after the event's commission rules (donate-proceeds > exemption > vendor rate).")
    unsold: float = Field(description="Asking-price value of unsold, non-donated units (remaining × price).")
    donate: float = Field(description="Asking-price value of unsold units marked to be donated to charity.")


class VendorSalesBlock(BaseModel):
    """One vendor's section of the vendor-sales workbook: item rows + totals."""

    vendor_code: str = Field(description="Unique code identifying the vendor.")
    vendor_name: str = Field(description="Display name for the Totals row (company, falling back to full name).")
    rows: list[VendorSalesItemRow] = Field(description="One row per consigned item, in intake order.")
    total_extend: float = Field(description="Sum of Extend across the block.")
    total_sell_extend: float = Field(description="Sum of Sell Extend across the block.")
    total_due_seller: float = Field(description="Sum of Due Seller across the block.")
    total_unsold: float = Field(description="Sum of Unsold across the block.")
    total_donate: float = Field(description="Sum of Donate across the block.")


class VendorSalesWorkbook(BaseModel):
    """Consolidated vendor-sales report: one block per vendor seller.

    Matches the legacy 'Retailer_Sales' xlsx layout the league sends to
    vendors at settlement. Exempt sellers (e.g. MYSL2 league merchandise)
    are listed LAST; all other vendors sort alphabetically by code. Rendered
    to xlsx by the report formatter.
    """

    event_id: int = Field(description="ID of the event this report covers.")
    event_name: str = Field(description="Human-readable name of the event.")
    commission_rate: float = Field(description="Event's vendor commission rate used for Due Seller.")
    vendors: list[VendorSalesBlock] = Field(description="One block per vendor seller (exempt sellers last).")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


class NonVendorSalesBlock(VendorSalesBlock):
    """One seller's section of the non-vendor sales workbook.

    Same shape as the vendor block (fields reused so one xlsx renderer
    serves both layouts); Due Seller inside the rows uses the event's
    INDIVIDUAL commission rate, and the seller display falls back to the
    person's full name instead of a company.
    """


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
    exempt_lines_total: float = Field(
        description=(
            "Sum of extended prices sold by commission-exempt sellers (e.g. MYSL2), paid in "
            "full to that seller. Excluded from seller_total and mysl_total; informational."
        )
    )
    generated_at: datetime = Field(description="UTC timestamp when this end-of-day report was generated.")


class NonVendorSalesItemRow(VendorSalesItemRow):
    """One item row of a seller's block in the non-vendor sales workbook.

    Identical columns to the vendor block (shared 16-column layout); value
    rules are the legacy sheet's, with Due Seller computed at the event's
    individual commission rate.
    """


class NonVendorSalesWorkbook(VendorSalesWorkbook):
    """Consolidated non-vendor sales report: one block per individual seller.

    Mirrors the vendor 'Retailer_Sales' workbook — same 16-column rows,
    per-seller Totals row, blank separator, exempt sellers last — but covers
    every NON-vendor (individual) consignor, with Due Seller computed at the
    event's individual commission rate. Subclasses VendorSalesWorkbook so the
    formatter's shared flatten/xlsx renderers serve both via isinstance.
    Rendered to xlsx as sheet 'NonVendor_Sales'.
    """

    # list invariance under pyright; blocks validate via model_dump round-trip.
    vendors: list[NonVendorSalesBlock] = Field(description="One block per non-vendor seller (exempt sellers last).")  # pyright: ignore[reportIncompatibleVariableOverride]


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


class CheckTransactionRow(BaseModel):
    """One sale tendered (partly) by check, for the check-transactions report."""

    sale_id: int = Field(description="Unique ID of the sale.")
    date_of_sale: Optional[datetime] = Field(default=None, description="Full timestamp of the transaction; null if not recorded.")
    cashier: str = Field(description="Login name of the user who completed this sale; stored on sale.created_by ('(unknown)' when not stored).")
    customer_name: Optional[str] = Field(default=None, description="Customer name captured at checkout; null when not recorded.")
    check_number: Optional[str] = Field(default=None, description="Check number recorded at checkout; null when the sale has no check on record.")
    check_amount: float = Field(description="Amount tendered by check on this sale.")
    sale_total: float = Field(description="Extended price total for this sale.")


class CheckTransactionsReport(BaseModel):
    """All check-tendered transactions for an event (voided sales excluded)."""

    event_id: int = Field(description="ID of the event this report covers.")
    event_name: str = Field(description="Name of the event.")
    transactions: list[CheckTransactionRow] = Field(description="Check-tendered sales, newest first (by sale ID).")
    total_check_amount: float = Field(description="Sum of check_amount across all listed transactions.")
    total_sale_amount: float = Field(description="Sum of sale_total across all listed transactions.")
    count: int = Field(description="Number of check-tendered transactions listed.")
    generated_at: datetime = Field(description="UTC timestamp when this report was generated.")


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
