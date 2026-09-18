/**
 * Shared TypeScript interfaces mirroring the backend Pydantic schemas.
 * Imported by API modules, components, and tests throughout the frontend.
 */

// Auth
/** Response payload from POST /auth/login. */
export interface TokenResponse {
 /** JWT access token to include in Authorization headers. */
 access_token: string;
 /** Role assigned to this user for the active event. */
 role: string;
 /** ID of the event this session is scoped to. */
 event_id: number;
}

/** Decoded payload of a JWT issued by the backend. */
export interface DecodedToken {
 /** Username (subject claim) encoded in the token. */
 sub: string;
 /** Role of the authenticated user: 'admin', 'intake', 'cashier', or 'cashier_intake'. */
 role: "admin" | "intake" | "cashier" | "cashier_intake";
 /** ID of the event this token is scoped to. */
 event_id: number;
 /** Token expiry as a Unix timestamp (seconds since epoch). */
 exp: number;
}

// Events
/** A consignment swap event (one per annual ski swap). */
export interface Event {
 /** Unique identifier for this event. */
 id: number;
 /** Human-readable event name, e.g. "Swap 2026". */
 name: string;
 /** Calendar year this event takes place. */
 year: number;
 /** MYSL's commission rate as a decimal fraction, e.g. 0.30 for 30%. */
 commission_rate: number;
 /** Vendor commission rate as a decimal fraction, e.g. 0.25 for 25%. Applied to vendor sellers instead of commission_rate. */
 vendor_commission_rate: number;
 /** Whether this event is currently active and accepting transactions. */
 is_active: boolean;
 /** Filename of this event's dedicated SQLite database (backend/events/, Phase G). */
 db_filename: string;
}

/** Payload for creating a new swap event. */
export interface EventCreate {
 /** Human-readable event name, e.g. "Swap 2026". */
 name: string;
 /** Calendar year this event takes place. */
 year: number;
 /** MYSL's commission rate as a decimal fraction, e.g. 0.30 for 30%. */
 commission_rate: number;
 /** Vendor commission rate as a decimal fraction, e.g. 0.25 for 25%. Applied to vendor sellers instead of commission_rate. */
 vendor_commission_rate: number;
}

// Users
/** A user account scoped to a specific event. */
export interface User {
 /** Unique identifier for this user record. */
 id: number;
 /** Login username, unique within the event. */
 username: string;
 /** Role controlling which screens and APIs this user can access. */
 role: "admin" | "intake" | "cashier" | "cashier_intake";
 /** Whether this account is currently allowed to log in. */
 is_active: boolean;
 /** Always null since Phase G — accounts are shared across events (the active event id rides on the JWT). */
 event_id: number | null;
}

/** Payload for creating a new event user. */
export interface UserCreate {
 /** Login username, must be unique within the event. */
 username: string;
 /** Plaintext password — hashed by the backend on creation. */
 password: string;
 /** Role to assign: 'admin', 'intake', 'cashier', or 'cashier_intake'. */
 role: "admin" | "intake" | "cashier" | "cashier_intake";
}

// Sellers
/** A consignment seller registered for a swap event. */
export interface Seller {
 /** Unique identifier for this seller record. */
 id: number;
 /** Short seller code, e.g. "A001". Unique within the event. */
 code: string;
 /** Seller's first name; null for vendor sellers that have no person name. */
 first_name: string | null;
 /** Seller's last name; null for vendor sellers that have no person name. */
 last_name: string | null;
 /** Company name for vendor sellers; null for individuals. */
 company: string | null;
 /** Whether this seller is a vendor (business) rather than an individual. */
 is_vendor: boolean;
 /** Contact phone number; null if not provided. */
 phone: string | null;
 /** Contact email address; null if not provided. */
 email: string | null;
 /** Street address; null if not provided. */
 address: string | null;
 /** City; null if not provided. */
 city: string | null;
 /** State abbreviation; null if not provided. */
 state: string | null;
 /** ZIP code; null if not provided. */
 zip: string | null;
 /** Per-seller default pre-populating intake.donate_unsold. */
 donate_unsold_default: boolean;
 /** Per-seller default pre-populating intake.donate_proceeds. */
 donate_proceeds_default: boolean;
 /** ID of the event this seller is registered for. */
 event_id: number;
 /** ISO 8601 timestamp when this seller record was created. */
 created_at: string;
}

/** Payload for registering a new seller. */
export interface SellerCreate {
 /** Seller's first name. Required for individuals; omitted for vendors. */
 first_name?: string;
 /** Seller's last name. Required for individuals; omitted for vendors. */
 last_name?: string;
 /** Company name; omit for individual sellers. */
 company?: string;
 /** Whether this seller is a vendor (business). Defaults to false. */
 is_vendor?: boolean;
 /** Contact phone number. */
 phone?: string;
 /** Contact email address. */
 email?: string;
 /** Street address. */
 address?: string;
 /** City. */
 city?: string;
 /** State abbreviation. */
 state?: string;
 /** ZIP code. */
 zip?: string;
 /** Per-seller default pre-populating intake.donate_unsold. Defaults to false. */
 donate_unsold_default?: boolean;
 /** Per-seller default pre-populating intake.donate_proceeds. Defaults to false. */
 donate_proceeds_default?: boolean;
}

/** Payload for partially updating a seller's contact details. */
export interface SellerUpdate {
 /** Replacement seller code. */
 code?: string;
 /** Updated first name. */
 first_name?: string;
 /** Updated last name. */
 last_name?: string;
 /** Updated company name. */
 company?: string;
 /** Updated vendor flag. */
 is_vendor?: boolean;
 /** Updated phone number. */
 phone?: string;
 /** Updated email address. */
 email?: string;
 /** Updated street address. */
 address?: string;
 /** Updated city. */
 city?: string;
 /** Updated state abbreviation. */
 state?: string;
 /** Updated ZIP code. */
 zip?: string;
 /** Updated default for intake.donate_unsold, if changing. */
 donate_unsold_default?: boolean;
 /** Updated default for intake.donate_proceeds, if changing. */
 donate_proceeds_default?: boolean;
}

// Items
/** A consignment item registered within an intake session. */
export interface Item {
 /** Unique identifier for this item record. */
 id: number;
 /** ID of the intake session this item belongs to. */
 intake_id: number;
 /** ID of the seller who consigned this item. */
 seller_id: number;
 /** Unique item code within the event, e.g. "A001-003". */
 code: string;
 /** Equipment category, e.g. "Skis", "Boots". */
 category: string | null;
 /** Equipment brand name. */
 brand: string | null;
 /** Item sub-type, e.g. "Alpine", "Nordic". */
 type: string | null;
 /** Free-text description. */
 description: string | null;
 /** Primary color. */
 color: string | null;
 /** Size designation (equipment-specific, e.g. "26.5" for boots). */
 size: string | null;
 /** Unit of measure for the size field, e.g. "cm", "mm". */
 uom: string | null;
 /** Target demographic, e.g. "Adult", "Child", "Junior". */
 gender_age: string | null;
 /** Model year of the equipment; null if unknown. */
 year: number | null;
 /** Whether the item is used (true) or new (false). */
 used: boolean;
 /** Asking price in dollars. */
 price: number;
 /** ORIGINAL intake quantity — units entered at intake (never mutated by sales). */
 quantity: number;
 /** On-hand sellable units = quantity − units sold (non-voided); what POS can sell. */
 remaining: number;
 /** Code 39 barcode string for label printing. */
 barcode_39: string | null;
 /** Second line of the printed label. */
 label_line_2: string | null;
 /** Third line of the printed label. */
 label_line_3: string | null;
 /** Whether this item should be donated if unsold at close of event rather than returned. */
 donate_unsold: boolean;
 /** Current lifecycle state of the item. */
 status: "available" | "sold" | "donated" | "returned";
 /** Whether a ZPL barcode label has been sent to the printer for this item. */
 label_printed: boolean;
 /** True if the item has been soft-deleted and excluded from listings/checkout. */
 is_deleted: boolean;
 /** Vendor-assigned item ID for cross-referencing vendor inventory; null for individuals. */
 vendor_item_id: string | null;
 /** ISO 8601 timestamp when this item record was created. */
 created_at: string;
}

/** Payload for adding a new item to an intake session. Item code is auto-generated. */
export interface ItemCreate {
 /** Equipment category. */
 category?: string;
 /** Equipment brand name. Required. */
 brand: string;
 /** Item sub-type. */
 type?: string;
 /** Free-text description. */
 description?: string;
 /** Primary color. */
 color?: string;
 /** Size designation. */
 size?: string;
 /** Unit of measure for the size field. */
 uom?: string;
 /** Target demographic. */
 gender_age?: string;
 /** Model year. */
 year?: number;
 /** Whether the item is used. Defaults to true. */
 used?: boolean;
 /** Asking price in dollars. */
 price: number;
 /** Number of units. Defaults to 1. */
 quantity?: number;
 /** Code 39 barcode string. */
 barcode_39?: string;
 /** Second line of the printed label. */
 label_line_2?: string;
 /** Third line of the printed label. */
 label_line_3?: string;
 /** Whether to donate if unsold. Defaults to false. */
 donate_unsold?: boolean;
 /** Vendor-assigned item ID. */
 vendor_item_id?: string;
}

/** Payload for partially updating an existing item. */
export interface ItemUpdate {
 /** Updated equipment category. */
 category?: string;
 /** Updated brand name. */
 brand?: string;
 /** Updated item sub-type. */
 type?: string;
 /** Updated free-text description. */
 description?: string;
 /** Updated primary color. */
 color?: string;
 /** Updated size designation. */
 size?: string;
 /** Updated unit of measure. */
 uom?: string;
 /** Updated target demographic. */
 gender_age?: string;
 /** Updated model year. */
 year?: number;
 /** Updated used flag. */
 used?: boolean;
 /** Updated asking price in dollars. */
 price?: number;
 /** On-hand remaining is adjusted via /items/{id}/quantity - not PATCHed here. */
 /** Updated barcode string. */
 barcode_39?: string;
 /** Updated second label line. */
 label_line_2?: string;
 /** Updated third label line. */
 label_line_3?: string;
 /** Updated donate-if-unsold flag. */
 donate_unsold?: boolean;
 /** Updated vendor item ID. */
 vendor_item_id?: string;
}

/** {@link Item} extended with the seller's short code for display in POS lookup results. */
export interface ItemLookupResponse extends Item {
 /** Short seller code of the seller who consigned this item, e.g. "A001". */
 seller_code: string;
}

/** {@link ItemLookupResponse} extended with the seller's display name for intake item search results. */
export interface ItemSearchResult extends ItemLookupResponse {
 /** Seller display name: "First Last" for individuals, company name for vendors. */
 seller_name: string | null;
}

/** A single skipped row from an Excel import. */
export interface ImportRowError {
 /** 1-based row number in the uploaded file. */
 row: number;
 /** Why this row was skipped. */
 reason: string;
}

/** Summary returned after importing a seller worksheet (seller block + items). */
export interface WorksheetImportResult {
 /** Code of the matched or newly created seller. */
 seller_code: string;
 /** Display name of the seller ('First Last'). */
 seller_name: string;
 /** True when no existing seller matched and a new one was created. */
 seller_created: boolean;
 /** How an existing seller was identified: 'name', 'email', or 'phone'; null when created. */
 seller_matched_by: string | null;
 /** Intake session the items were imported into. */
 intake_id: number;
 /** True when a new intake session was created for the seller. */
 intake_created: boolean;
 /** Number of items successfully created. */
 imported: number;
 /** Number of item rows skipped due to validation errors. */
 skipped: number;
 /** Details of each skipped row. */
 errors: ImportRowError[];
}

/** An existing seller that looks like a duplicate of the worksheet seller. */
export interface SellerCandidate {
 /** Seller code, e.g. 'JSMI1'. */
 code: string;
 /** Display name ('First Last'), null for vendors without a name. */
 name: string | null;
 /** Stored email address. */
 email: string | null;
 /** Stored phone number. */
 phone: string | null;
 /** Intake sessions the seller already has in the active event. */
 existing_intakes: number;
 /** Why this seller was surfaced as a possible duplicate. */
 match_reason: string;
}

/** Review payload returned instead of importing when the worksheet seller
 * looks like a duplicate of an existing seller — the intake user decides. */
export interface SellerMatchReview {
 /** Always true; distinguishes this payload from WorksheetImportResult. */
 needs_review: true;
 /** Overall explanation of why candidates were surfaced. */
 reason: string;
 /** Seller name as entered in the worksheet block. */
 worksheet_name: string | null;
 /** Email as entered in the worksheet block. */
 worksheet_email: string | null;
 /** Phone as entered in the worksheet block. */
 worksheet_phone: string | null;
 /** Existing sellers that look like possible duplicates, with per-candidate reasons. */
 candidates: SellerCandidate[];
}

/** The worksheet import endpoint returns either the review payload or the
 * final import summary. */
export type WorksheetImportResponse = WorksheetImportResult | SellerMatchReview;

/** Summary returned after a bulk Excel item import. */
export interface ImportResult {
 /** Number of items successfully created. */
 imported: number;
 /** Number of rows that were skipped. */
 skipped: number;
 /** Details for each skipped row. */
 errors: ImportRowError[];
}

// Intakes
/** A single intake session grouping items consigned by one seller. */
export interface Intake {
 /** Unique identifier for this intake session. */
 id: number;
 /** ID of the seller who brought in these items. */
 seller_id: number;
 /** Calendar date the intake was entered, as an ISO 8601 date string (YYYY-MM-DD). */
 date_entered: string;
 /** Date physical items were received; null until confirmed. */
 date_received: string | null;
 /** Whether all unsold items from this intake should be donated at close of event rather than returned to the seller. */
 donate_unsold: boolean;
 /** Whether 100% of sale proceeds are donated to MYSL; the seller waives their commission cut entirely. */
 donate_proceeds: boolean;
 /** Total value of all items in this intake at their asking prices. */
 total: number;
 /** MYSL's share of sales proceeds from this intake after commission calculation. */
 mysl_total: number;
 /** Seller's share of sales proceeds from this intake after commission calculation. */
 seller_total: number;
 /** ISO 8601 timestamp when this intake record was created. */
 created_at: string;
 /** Username of the intake clerk who recorded this intake; null if not recorded. */
 created_by: string | null;
}

/** {@link Intake} with its items eagerly loaded. */
export interface IntakeWithItems extends Intake {
 /** All items belonging to this intake session. */
 items: Item[];
}

/** Payload for creating a new intake session. */
export interface IntakeCreate {
 /** ID of the seller whose items are being taken in. */
 seller_id: number;
 /** Intake date; defaults to today if omitted. */
 date_entered?: string;
 /** Date physical items were received; can be set later. */
 date_received?: string;
 /** Whether to donate all unsold items rather than return them. Defaults to false. */
 donate_unsold?: boolean;
 /** Whether seller donates 100% of proceeds to MYSL. Defaults to false. */
 donate_proceeds?: boolean;
}

/** Payload for updating an existing intake session's options. */
export interface IntakeUpdate {
 /** Updated date physical items were received. */
 date_received?: string;
 /** Updated donate-unsold flag. */
 donate_unsold?: boolean;
 /** Updated donate-proceeds flag. */
 donate_proceeds?: boolean;
}

// Sales
/** Line item in a sale creation request. */
export interface SaleItemCreate {
 /** ID of the inventory item being sold. */
 item_id: number;
 /** Number of units to sell; must not exceed the item's remaining quantity. Defaults to 1. */
 quantity?: number;
 /** Override sell price in dollars; defaults to the item's listed price if omitted. */
 sell_price?: number;
 /** Optional notes for this line item. */
 notes?: string;
}

/** Payload for creating a new sale transaction. */
export interface SaleCreate {
 /** Items included in this sale. */
 items: SaleItemCreate[];
 /** Amount tendered in cash (dollars). */
 cash_amount?: number;
 /** Amount tendered by check (dollars). */
 check_amount?: number;
 /** Amount charged to a credit/debit card via Square (dollars). */
 cc_amount?: number;
 /** Square transaction id (or card reference) when payment is by card. */
 cc_transaction_id?: string;
 /** Check number if payment is by check. */
 check_number?: string;
 /** Customer name for receipt or records. */
 customer_name?: string;
 /** Customer email for receipt or records. */
 customer_email?: string;
 /** Optional free-text notes for the sale. */
 notes?: string;
}

/** A single line item in a completed sale response. */
export interface SaleItemResponse {
 /** Unique identifier for this sale item record. */
 id: number;
 /** ID of the parent sale transaction. */
 sale_id: number;
 /** ID of the inventory item that was sold. */
 item_id: number;
 /** Item code (denormalized for read-only receipt/report display); null when
  *  the underlying item record is unavailable. */
 item_code: string | null;
 /** Sequential line number within the sale; null if not assigned. */
 line_number: number | null;
 /** Number of units sold (almost always 1). */
 quantity: number;
 /** Actual sell price per unit. */
 sell_price: number;
 /** sell_price × quantity. */
 extended_price: number;
 /** Optional notes for this line item. */
 notes: string | null;
 /** ISO 8601 timestamp when this sale item record was created. */
 created_at: string;
}

/** A completed sale transaction with all line items. */
export interface SaleWithItemsResponse {
 /** Unique identifier for this sale. */
 id: number;
 /** ID of the event this sale belongs to. */
 event_id: number;
 /** Date the sale occurred; null if not yet set. */
 date_of_sale: string | null;
 /** Customer name; null if not collected. */
 customer_name: string | null;
 /** Customer email; null if not collected. */
 customer_email: string | null;
 /** Sum of all line item extended prices. */
 sale_total: number;
 /** MYSL's commission share of this sale's proceeds. */
 mysl_total: number;
 /** Sellers' combined share of this sale's proceeds after commission. */
 seller_total: number;
 /** Cash amount tendered. */
 cash_amount: number;
 /** Check amount tendered. */
 check_amount: number;
 /** Credit/debit card amount charged via Square. */
 cc_amount: number;
 /** Check number; null if payment was not by check. */
 check_number: string | null;
 /** Square transaction id / card reference; null if payment was not by card. */
 cc_transaction_id: string | null;
 /** Total amount paid (cash + check + cc). */
 total_paid: number;
 /** Remaining amount owed after payment; typically 0 for completed sales. */
 balance_due: number;
 /** Optional free-text notes for the sale. */
 notes: string | null;
 /** Whether this sale has been voided. */
 is_voided: boolean;
 /** ISO 8601 timestamp when this sale was created. */
 created_at: string;
 /** Username of the cashier who created this sale; null if not recorded. */
 created_by: string | null;
 /** Individual line items included in this sale. */
 sale_items: SaleItemResponse[];
}

// Reports
/** Seller contact and settlement details shown on the payout report. */
export interface SellerPayoutSellerInfo {
 /** Short seller code. */
 seller_code: string;
 /** Seller's full name (or company for vendors). */
 seller_name: string;
 /** Company name for vendor sellers. */
 company: string | null;
 /** True when the seller is a commercial vendor. */
 is_vendor: boolean;
 /** Seller's email; null if not on file. */
 email: string | null;
 /** Seller's phone number; null if not on file. */
 phone: string | null;
 /** Seller's street address. */
 address: string | null;
 /** Seller's city. */
 city: string | null;
 /** Seller's state. */
 state: string | null;
 /** Seller's ZIP code. */
 zip: string | null;
 /** Commission rate applied to this seller's sales. */
 commission_rate: number;
}

/** A single sold-item row in the SALES section of a seller payout. */
export interface SellerPayoutSaleLine {
 /** Item code. */
 item_code: string;
 /** Item description; null if not provided at intake. */
 description: string | null;
 /** Timestamp of the sale transaction; null if not recorded. */
 date_of_sale: string | null;
 /** Units of the item sold in this transaction line. */
 quantity_sold: number;
 /** Sell price per unit. */
 sell_price: number;
 /** Quantity sold x sell price for this line. */
 extended_price: number;
 /** Cashier's reason for adjusting the price from the listed amount; null when unadjusted. */
 price_adjustment_reason: string | null;
 /** MYSL commission for this sale line. */
 mysl_share: number;
 /** Seller payout for this sale line. */
 seller_share: number;
 /** Commission rate applied to this sale line. */
 commission_rate: number;
}

/** A single row in the UNSOLD ITEMS section of a seller payout. */
export interface SellerPayoutUnsoldLine {
 /** Item code. */
 item_code: string;
 /** Item description; null if not provided at intake. */
 description: string | null;
 /** Original intake quantity. */
 quantity: number;
 /** On-hand units still not sold. */
 remaining: number;
 /** Original asking price. */
 price: number;
 /** Lifecycle status (available / donated / returned). */
 status: string;
 /** True when the seller elected to donate this item if unsold. */
 donate_unsold: boolean;
 /** MYSL commission (always 0 for unsold items). */
 mysl_share: number;
 /** Seller payout (always 0 for unsold items). */
 seller_share: number;
 /** Commission rate that would apply if this item sold. */
 commission_rate: number;
}

/** Full payout report for a single seller with SALES and UNSOLD ITEMS sections. */
export interface SellerPayoutReport {
 /** ID of the event this report covers. */
 event_id: number;
 /** Name of the event. */
 event_name: string;
 /** ID of the seller this report is for. */
 seller_id: number;
 /** Short seller code. */
 seller_code: string;
 /** Seller's full name. */
 seller_name: string;
 /** Seller's email; null if not on file. */
 seller_email: string | null;
 /** Seller contact and settlement details. */
 seller_info: SellerPayoutSellerInfo;
 /** Total items consigned by this seller. */
 items_consigned: number;
 /** Number of items that sold. */
 items_sold: number;
 /** Number of items still unsold. */
 items_unsold: number;
 /** Number of items donated. */
 items_donated: number;
 /** Total of all sell prices for sold items. */
 gross_sales: number;
 /** MYSL's commission share of gross sales. */
 mysl_total: number;
 /** Amount owed to the seller after commission. */
 seller_total: number;
 /** SALES section: every non-voided sale line for this seller's items. */
 sales: SellerPayoutSaleLine[];
 /** UNSOLD ITEMS section: every item still on hand. */
 unsold_items: SellerPayoutUnsoldLine[];
 /** ISO 8601 timestamp when this report was generated. */
 generated_at: string;
}

/** One equipment-type row of a vendor's equipment summary. */
export interface VendorCategorySummary {
 /** Equipment type (item.category); '(uncategorized)' when blank. */
 category: string;
 /** Distinct items consigned in this category. */
 items_consigned: number;
 /** Units sold in this category. */
 units_sold: number;
 /** Extended-price revenue for this category. */
 gross_sales: number;
 /** MYSL commission for this category. */
 mysl_share: number;
 /** Vendor payout for this category. */
 seller_share: number;
 /** Units still on hand in this category. */
 units_unsold: number;
 /** Asking-price value of the on-hand units. */
 unsold_value: number;
}

/** Per-vendor sales summary grouped by equipment type (vendors only; admin-only). */
export interface VendorEquipmentSummaryReport {
 /** ID of the event this report covers. */
 event_id: number;
 /** Name of the event. */
 event_name: string;
 /** Short seller code. */
 seller_code: string;
 /** Vendor name (company). */
 seller_name: string;
 /** Company name for vendor sellers. */
 company: string | null;
 /** Commission rate applied to this vendor's sales. */
 vendor_commission_rate: number;
 /** One row per equipment type, sorted by category name. */
 categories: VendorCategorySummary[];
 /** Grand totals across all categories (category = 'TOTAL'). */
 total: VendorCategorySummary;
 /** ISO 8601 timestamp when this report was generated. */
 generated_at: string;
}

/** Payout reports for ALL sellers in an event, plus grand totals. */
export interface SellersPayoutsReport {
 /** ID of the event this report covers. */
 event_id: number;
 /** Name of the event. */
 event_name: string;
 /** Number of sellers included. */
 seller_count: number;
 /** Sum of every seller's gross sales. */
 gross_sales_total: number;
 /** Grand total MYSL commission. */
 mysl_total: number;
 /** Grand total payable to all sellers. */
 seller_total: number;
 /** Per-seller payout reports. */
 sellers: SellerPayoutReport[];
 /** ISO 8601 timestamp when this report was generated. */
 generated_at: string;
}

/** Aggregate revenue report for the entire event. */
export interface EventRevenueReport {
 /** ID of the event this report covers. */
 event_id: number;
 /** Name of the event. */
 event_name: string;
 /** Calendar year of the event. */
 event_year: number;
 /** Total number of non-voided sale transactions. */
 total_sales: number;
 /** Number of voided sale transactions. */
 voided_sales: number;
 /** Sum of all non-voided sale totals. */
 gross_revenue: number;
 /** MYSL's total commission share across all sales. */
 mysl_total: number;
 /** Total amount owed to all sellers across all sales. */
 seller_total: number;
 /** Total cash received across all sales. */
 cash_total: number;
 /** Total check payments received across all sales. */
 check_total: number;
 /** Total credit/debit card payments received via Square. */
 cc_total: number;
 /** Total value of sales where sellers donated 100% of proceeds. */
 donate_proceeds_total: number;
 /** ISO 8601 timestamp when this report was generated. */
 generated_at: string;
}

/** A single donated item in the donations report. */
export interface DonationItem {
 /** Short seller code of the item's consignor. */
 seller_code: string;
 /** Full name of the item's consignor. */
 seller_name: string;
 /** Item code, e.g. "A001-003". */
 item_code: string;
 /** Item description; null if not provided. */
 description: string | null;
 /** Original intake quantity. */
 quantity: number;
 /** On-hand units still not sold (donated units for unsold-type donations). */
 remaining: number;
 /** Item's asking price. */
 price: number;
 /** Reason for donation: "donate_unsold" (unsold item flagged at intake) or "donate_proceeds" (seller opted to donate all proceeds). */
 donation_type: string;
}

/** Report of all donated items for an event. */
export interface DonationsReport {
 /** ID of the event this report covers. */
 event_id: number;
 /** Name of the event. */
 event_name: string;
 /** All items flagged as donated, by either mechanism. */
 items: DonationItem[];
 /** Total count of donated items. */
 total_items: number;
 /** Sum of asking prices for all donated items. */
 total_value: number;
 /** ISO 8601 timestamp when this report was generated. */
 generated_at: string;
}

/** A single unsold item in the unsold inventory report. */
export interface UnsoldItem {
 /** Short seller code of the item's consignor. */
 seller_code: string;
 /** Full name of the item's consignor. */
 seller_name: string;
 /** Item code, e.g. "A001-003". */
 item_code: string;
 /** Item description; null if not provided. */
 description: string | null;
 /** Equipment category; null if not provided. */
 category: string | null;
 /** Original intake quantity. */
 quantity: number;
 /** On-hand units still not sold. */
 remaining: number;
 /** Item's asking price. */
 price: number;
 /** Whether the consignor elected to donate this item if unsold. */
 donate_unsold: boolean;
}

/** Report of all unsold (available or returned) items for an event. */
export interface UnsoldItemsReport {
 /** ID of the event this report covers. */
 event_id: number;
 /** Name of the event. */
 event_name: string;
 /** All items that remain unsold at time of report generation. */
 items: UnsoldItem[];
 /** Total count of unsold items. */
 total_items: number;
 /** Sum of asking prices for all unsold items. */
 total_value: number;
 /** ISO 8601 timestamp when this report was generated. */
 generated_at: string;
}

/** End-of-day summary report for the active event. */
export interface EndOfDayReport {
 /** ID of the event this report covers. */
 event_id: number;
 /** Name of the event. */
 event_name: string;
 /** Calendar date this report covers, as YYYY-MM-DD. */
 date_generated: string;
 /** Number of non-voided sales processed on this day. */
 sales_count: number;
 /** Number of voided sales on this day. */
 voided_count: number;
 /** Total revenue from non-voided sales on this day. */
 gross_revenue: number;
 /** MYSL's commission share of today's gross revenue. */
 mysl_total: number;
 /** Total owed to sellers from today's sales. */
 seller_total: number;
 /** Total cash received today. */
 cash_total: number;
 /** Total check payments received today. */
 check_total: number;
 /** Total credit/debit card payments received today via Square. */
 cc_total: number;
 /** ISO 8601 timestamp when this report was generated. */
 generated_at: string;
}

export interface TransactionRow {
 sale_id: number;
 cashier: string;
 date_of_sale: string | null;
 items_count: number;
 units_sold: number;
 sale_total: number;
 mysl_total: number;
 seller_total: number;
 cash_amount: number;
 check_amount: number;
 cc_amount: number;
 is_voided: boolean;
}

export interface UserSalesSummary {
 cashier: string;
 transactions: TransactionRow[];
 sales_count: number;
 voided_count: number;
 gross_sales: number;
 mysl_total: number;
 seller_total: number;
 cash_total: number;
 check_total: number;
 cc_total: number;
}

export interface TransactionsByUserReport {
 event_id: number;
 event_name: string;
 users: UserSalesSummary[];
 total_sales: number;
 total_voided: number;
 gross_sales: number;
 mysl_total: number;
 seller_total: number;
 generated_at: string;
}
