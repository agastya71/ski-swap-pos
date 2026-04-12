/**
 * Shared TypeScript interfaces mirroring the backend Pydantic schemas.
 * Imported by API modules, components, and tests throughout the frontend.
 */

// Auth
/** Response payload from POST /auth/login. */
export interface TokenResponse {
  /** JWT access token to include in Authorization headers. */
  access_token: string
  /** Role assigned to this user for the active event. */
  role: string
  /** ID of the event this session is scoped to. */
  event_id: number
}

/** Decoded payload of a JWT issued by the backend. */
export interface DecodedToken {
  /** Username (subject claim) encoded in the token. */
  sub: string
  /** Role of the authenticated user: 'admin', 'intake', or 'cashier'. */
  role: 'admin' | 'intake' | 'cashier'
  /** ID of the event this token is scoped to. */
  event_id: number
  /** Token expiry as a Unix timestamp (seconds since epoch). */
  exp: number
}

// Events
/** A consignment swap event (one per annual ski swap). */
export interface Event {
  /** Unique identifier for this event. */
  id: number
  /** Human-readable event name, e.g. "Swap 2026". */
  name: string
  /** Calendar year this event takes place. */
  year: number
  /** MYSL's commission rate as a decimal fraction, e.g. 0.30 for 30%. */
  commission_rate: number
  /** Vendor commission rate as a decimal fraction, e.g. 0.25 for 25%. Applied to vendor sellers instead of commission_rate. */
  vendor_commission_rate: number
  /** Whether this event is currently active and accepting transactions. */
  is_active: boolean
}

/** Payload for creating a new swap event. */
export interface EventCreate {
  /** Human-readable event name, e.g. "Swap 2026". */
  name: string
  /** Calendar year this event takes place. */
  year: number
  /** MYSL's commission rate as a decimal fraction, e.g. 0.30 for 30%. */
  commission_rate: number
  /** Vendor commission rate as a decimal fraction, e.g. 0.25 for 25%. Applied to vendor sellers instead of commission_rate. */
  vendor_commission_rate: number
}

// Users
/** A user account scoped to a specific event. */
export interface User {
  /** Unique identifier for this user record. */
  id: number
  /** Login username, unique within the event. */
  username: string
  /** Role controlling which screens and APIs this user can access. */
  role: 'admin' | 'intake' | 'cashier'
  /** Whether this account is currently allowed to log in. */
  is_active: boolean
  /** ID of the event this user account belongs to. */
  event_id: number
}

/** Payload for creating a new event user. */
export interface UserCreate {
  /** Login username, must be unique within the event. */
  username: string
  /** Plaintext password — hashed by the backend on creation. */
  password: string
  /** Role to assign: 'admin', 'intake', or 'cashier'. */
  role: 'admin' | 'intake' | 'cashier'
}

// Sellers
/** A consignment seller registered for a swap event. */
export interface Seller {
  /** Unique identifier for this seller record. */
  id: number
  /** Short seller code, e.g. "A001". Unique within the event. */
  code: string
  /** Seller's first name. */
  first_name: string
  /** Seller's last name. */
  last_name: string
  /** Company name for vendor sellers; null for individuals. */
  company: string | null
  /** Whether this seller is a vendor (business) rather than an individual. */
  is_vendor: boolean
  /** Contact phone number; null if not provided. */
  phone: string | null
  /** Contact email address; null if not provided. */
  email: string | null
  /** Street address; null if not provided. */
  address: string | null
  /** City; null if not provided. */
  city: string | null
  /** State abbreviation; null if not provided. */
  state: string | null
  /** ZIP code; null if not provided. */
  zip: string | null
  /** ID of the event this seller is registered for. */
  event_id: number
  /** ISO 8601 timestamp when this seller record was created. */
  created_at: string
}

/** Payload for registering a new seller. */
export interface SellerCreate {
  /** Seller's first name. */
  first_name: string
  /** Seller's last name. */
  last_name: string
  /** Company name; omit for individual sellers. */
  company?: string
  /** Whether this seller is a vendor (business). Defaults to false. */
  is_vendor?: boolean
  /** Contact phone number. */
  phone?: string
  /** Contact email address. */
  email?: string
  /** Street address. */
  address?: string
  /** City. */
  city?: string
  /** State abbreviation. */
  state?: string
  /** ZIP code. */
  zip?: string
}

/** Payload for partially updating a seller's contact details. */
export interface SellerUpdate {
  /** Replacement seller code. */
  code?: string
  /** Updated first name. */
  first_name?: string
  /** Updated last name. */
  last_name?: string
  /** Updated company name. */
  company?: string
  /** Updated vendor flag. */
  is_vendor?: boolean
  /** Updated phone number. */
  phone?: string
  /** Updated email address. */
  email?: string
  /** Updated street address. */
  address?: string
  /** Updated city. */
  city?: string
  /** Updated state abbreviation. */
  state?: string
  /** Updated ZIP code. */
  zip?: string
}

// Items
/** A consignment item registered within an intake session. */
export interface Item {
  /** Unique identifier for this item record. */
  id: number
  /** ID of the intake session this item belongs to. */
  intake_id: number
  /** ID of the seller who consigned this item. */
  seller_id: number
  /** Unique item code within the event, e.g. "A001-003". */
  code: string
  /** Equipment category, e.g. "Skis", "Boots". */
  category: string | null
  /** Equipment brand name. */
  brand: string | null
  /** Item sub-type, e.g. "Alpine", "Nordic". */
  type: string | null
  /** Free-text description. */
  description: string | null
  /** Primary color. */
  color: string | null
  /** Size designation (equipment-specific, e.g. "26.5" for boots). */
  size: string | null
  /** Unit of measure for the size field, e.g. "cm", "mm". */
  uom: string | null
  /** Target demographic, e.g. "Adult", "Child", "Junior". */
  gender_age: string | null
  /** Model year of the equipment; null if unknown. */
  year: number | null
  /** Whether the item is used (true) or new (false). */
  used: boolean
  /** Asking price in dollars. */
  price: number
  /** Number of identical units (almost always 1 for swap events). */
  quantity: number
  /** Code 39 barcode string for label printing. */
  barcode_39: string | null
  /** Second line of the printed label. */
  label_line_2: string | null
  /** Third line of the printed label. */
  label_line_3: string | null
  /** Whether this item should be donated if unsold at close of event rather than returned. */
  donate_unsold: boolean
  /** Current lifecycle state of the item. */
  status: 'available' | 'sold' | 'donated' | 'returned'
  /** Whether a ZPL barcode label has been sent to the printer for this item. */
  label_printed: boolean
  /** Vendor-assigned item ID for cross-referencing vendor inventory; null for individuals. */
  vendor_item_id: string | null
  /** ISO 8601 timestamp when this item record was created. */
  created_at: string
}

/** Payload for adding a new item to an intake session. Item code is auto-generated. */
export interface ItemCreate {
  /** Equipment category. */
  category?: string
  /** Equipment brand name. */
  brand?: string
  /** Item sub-type. */
  type?: string
  /** Free-text description. */
  description?: string
  /** Primary color. */
  color?: string
  /** Size designation. */
  size?: string
  /** Unit of measure for the size field. */
  uom?: string
  /** Target demographic. */
  gender_age?: string
  /** Model year. */
  year?: number
  /** Whether the item is used. Defaults to true. */
  used?: boolean
  /** Asking price in dollars. */
  price: number
  /** Number of units. Defaults to 1. */
  quantity?: number
  /** Code 39 barcode string. */
  barcode_39?: string
  /** Second line of the printed label. */
  label_line_2?: string
  /** Third line of the printed label. */
  label_line_3?: string
  /** Whether to donate if unsold. Defaults to false. */
  donate_unsold?: boolean
  /** Vendor-assigned item ID. */
  vendor_item_id?: string
}

/** Payload for partially updating an existing item. */
export interface ItemUpdate {
  /** Updated equipment category. */
  category?: string
  /** Updated brand name. */
  brand?: string
  /** Updated item sub-type. */
  type?: string
  /** Updated free-text description. */
  description?: string
  /** Updated primary color. */
  color?: string
  /** Updated size designation. */
  size?: string
  /** Updated unit of measure. */
  uom?: string
  /** Updated target demographic. */
  gender_age?: string
  /** Updated model year. */
  year?: number
  /** Updated used flag. */
  used?: boolean
  /** Updated asking price in dollars. */
  price?: number
  /** Updated quantity. */
  quantity?: number
  /** Updated barcode string. */
  barcode_39?: string
  /** Updated second label line. */
  label_line_2?: string
  /** Updated third label line. */
  label_line_3?: string
  /** Updated donate-if-unsold flag. */
  donate_unsold?: boolean
  /** Updated vendor item ID. */
  vendor_item_id?: string
}

/** {@link Item} extended with the seller's short code for display in POS lookup results. */
export interface ItemLookupResponse extends Item {
  /** Short seller code of the seller who consigned this item, e.g. "A001". */
  seller_code: string
}

/** A single skipped row from an Excel import. */
export interface ImportRowError {
  /** 1-based row number in the uploaded file. */
  row: number
  /** Why this row was skipped. */
  reason: string
}

/** Summary returned after a bulk Excel item import. */
export interface ImportResult {
  /** Number of items successfully created. */
  imported: number
  /** Number of rows that were skipped. */
  skipped: number
  /** Details for each skipped row. */
  errors: ImportRowError[]
}

// Intakes
/** A single intake session grouping items consigned by one seller. */
export interface Intake {
  /** Unique identifier for this intake session. */
  id: number
  /** ID of the seller who brought in these items. */
  seller_id: number
  /** Calendar date the intake was entered, as an ISO 8601 date string (YYYY-MM-DD). */
  date_entered: string
  /** Date physical items were received; null until confirmed. */
  date_received: string | null
  /** Whether all unsold items from this intake should be donated at close of event rather than returned to the seller. */
  donate_unsold: boolean
  /** Whether 100% of sale proceeds are donated to MYSL; the seller waives their commission cut entirely. */
  donate_proceeds: boolean
  /** Total value of all items in this intake at their asking prices. */
  total: number
  /** MYSL's share of sales proceeds from this intake after commission calculation. */
  mysl_total: number
  /** Seller's share of sales proceeds from this intake after commission calculation. */
  seller_total: number
  /** ISO 8601 timestamp when this intake record was created. */
  created_at: string
}

/** {@link Intake} with its items eagerly loaded. */
export interface IntakeWithItems extends Intake {
  /** All items belonging to this intake session. */
  items: Item[]
}

/** Payload for creating a new intake session. */
export interface IntakeCreate {
  /** ID of the seller whose items are being taken in. */
  seller_id: number
  /** Intake date; defaults to today if omitted. */
  date_entered?: string
  /** Date physical items were received; can be set later. */
  date_received?: string
  /** Whether to donate all unsold items rather than return them. Defaults to false. */
  donate_unsold?: boolean
  /** Whether seller donates 100% of proceeds to MYSL. Defaults to false. */
  donate_proceeds?: boolean
}

/** Payload for updating an existing intake session's options. */
export interface IntakeUpdate {
  /** Updated date physical items were received. */
  date_received?: string
  /** Updated donate-unsold flag. */
  donate_unsold?: boolean
  /** Updated donate-proceeds flag. */
  donate_proceeds?: boolean
}

// Sales
/** Line item in a sale creation request. */
export interface SaleItemCreate {
  /** ID of the inventory item being sold. */
  item_id: number
  /** Override sell price in dollars; defaults to the item's listed price if omitted. */
  sell_price?: number
  /** Optional notes for this line item. */
  notes?: string
}

/** Payload for creating a new sale transaction. */
export interface SaleCreate {
  /** Items included in this sale. */
  items: SaleItemCreate[]
  /** Amount tendered in cash (dollars). */
  cash_amount?: number
  /** Amount tendered by check (dollars). */
  check_amount?: number
  /** Amount charged to a credit/debit card via Square (dollars). */
  cc_amount?: number
  /** Check number if payment is by check. */
  check_number?: string
  /** Customer name for receipt or records. */
  customer_name?: string
  /** Customer email for receipt or records. */
  customer_email?: string
  /** Optional free-text notes for the sale. */
  notes?: string
}

/** A single line item in a completed sale response. */
export interface SaleItemResponse {
  /** Unique identifier for this sale item record. */
  id: number
  /** ID of the parent sale transaction. */
  sale_id: number
  /** ID of the inventory item that was sold. */
  item_id: number
  /** Sequential line number within the sale; null if not assigned. */
  line_number: number | null
  /** Number of units sold (almost always 1). */
  quantity: number
  /** Actual sell price per unit. */
  sell_price: number
  /** sell_price × quantity. */
  extended_price: number
  /** Optional notes for this line item. */
  notes: string | null
  /** ISO 8601 timestamp when this sale item record was created. */
  created_at: string
}

/** A completed sale transaction with all line items. */
export interface SaleWithItemsResponse {
  /** Unique identifier for this sale. */
  id: number
  /** ID of the event this sale belongs to. */
  event_id: number
  /** Date the sale occurred; null if not yet set. */
  date_of_sale: string | null
  /** Customer name; null if not collected. */
  customer_name: string | null
  /** Customer email; null if not collected. */
  customer_email: string | null
  /** Sum of all line item extended prices. */
  sale_total: number
  /** MYSL's commission share of this sale's proceeds. */
  mysl_total: number
  /** Sellers' combined share of this sale's proceeds after commission. */
  seller_total: number
  /** Cash amount tendered. */
  cash_amount: number
  /** Check amount tendered. */
  check_amount: number
  /** Credit/debit card amount charged via Square. */
  cc_amount: number
  /** Check number; null if payment was not by check. */
  check_number: string | null
  /** Total amount paid (cash + check + cc). */
  total_paid: number
  /** Remaining amount owed after payment; typically 0 for completed sales. */
  balance_due: number
  /** Optional free-text notes for the sale. */
  notes: string | null
  /** Whether this sale has been voided. */
  is_voided: boolean
  /** ISO 8601 timestamp when this sale was created. */
  created_at: string
  /** Username of the cashier who created this sale; null if not recorded. */
  created_by: string | null
  /** Individual line items included in this sale. */
  sale_items: SaleItemResponse[]
}

// Reports
/** A single item row in a seller payout report. */
export interface SellerPayoutLineItem {
  /** Item code, e.g. "A001-003". */
  item_code: string
  /** Item description; null if not provided at intake. */
  description: string | null
  /** Original asking price. */
  price: number
  /** Actual sell price (may differ if overridden at POS). */
  sell_price: number
  /** Lifecycle status of the item at time of report generation. */
  status: string
}

/** Full payout report for a single seller, listing all their consigned items and totals. */
export interface SellerPayoutReport {
  /** ID of the event this report covers. */
  event_id: number
  /** Name of the event. */
  event_name: string
  /** ID of the seller this report is for. */
  seller_id: number
  /** Short seller code. */
  seller_code: string
  /** Seller's full name. */
  seller_name: string
  /** Seller's email; null if not on file. */
  seller_email: string | null
  /** Total items consigned by this seller. */
  items_consigned: number
  /** Number of items that sold. */
  items_sold: number
  /** Number of items still unsold. */
  items_unsold: number
  /** Number of items donated. */
  items_donated: number
  /** Total of all sell prices for sold items. */
  gross_sales: number
  /** MYSL's commission share of gross sales. */
  mysl_total: number
  /** Amount owed to the seller after commission. */
  seller_total: number
  /** Line-by-line breakdown of all consigned items. */
  line_items: SellerPayoutLineItem[]
  /** ISO 8601 timestamp when this report was generated. */
  generated_at: string
}

/** Aggregate revenue report for the entire event. */
export interface EventRevenueReport {
  /** ID of the event this report covers. */
  event_id: number
  /** Name of the event. */
  event_name: string
  /** Calendar year of the event. */
  event_year: number
  /** Total number of non-voided sale transactions. */
  total_sales: number
  /** Number of voided sale transactions. */
  voided_sales: number
  /** Sum of all non-voided sale totals. */
  gross_revenue: number
  /** MYSL's total commission share across all sales. */
  mysl_total: number
  /** Total amount owed to all sellers across all sales. */
  seller_total: number
  /** Total cash received across all sales. */
  cash_total: number
  /** Total check payments received across all sales. */
  check_total: number
  /** Total credit/debit card payments received via Square. */
  cc_total: number
  /** Total value of sales where sellers donated 100% of proceeds. */
  donate_proceeds_total: number
  /** ISO 8601 timestamp when this report was generated. */
  generated_at: string
}

/** A single donated item in the donations report. */
export interface DonationItem {
  /** Short seller code of the item's consignor. */
  seller_code: string
  /** Item code, e.g. "A001-003". */
  item_code: string
  /** Item description; null if not provided. */
  description: string | null
  /** Item's asking price. */
  price: number
  /** Reason for donation: "donate_unsold" (unsold item flagged at intake) or "donate_proceeds" (seller opted to donate all proceeds). */
  donation_type: string
}

/** Report of all donated items for an event. */
export interface DonationsReport {
  /** ID of the event this report covers. */
  event_id: number
  /** Name of the event. */
  event_name: string
  /** All items flagged as donated, by either mechanism. */
  items: DonationItem[]
  /** Total count of donated items. */
  total_items: number
  /** Sum of asking prices for all donated items. */
  total_value: number
  /** ISO 8601 timestamp when this report was generated. */
  generated_at: string
}

/** A single unsold item in the unsold inventory report. */
export interface UnsoldItem {
  /** Short seller code of the item's consignor. */
  seller_code: string
  /** Item code, e.g. "A001-003". */
  item_code: string
  /** Item description; null if not provided. */
  description: string | null
  /** Equipment category; null if not provided. */
  category: string | null
  /** Item's asking price. */
  price: number
}

/** Report of all unsold (available or returned) items for an event. */
export interface UnsoldItemsReport {
  /** ID of the event this report covers. */
  event_id: number
  /** Name of the event. */
  event_name: string
  /** All items that remain unsold at time of report generation. */
  items: UnsoldItem[]
  /** Total count of unsold items. */
  total_items: number
  /** Sum of asking prices for all unsold items. */
  total_value: number
  /** ISO 8601 timestamp when this report was generated. */
  generated_at: string
}

/** End-of-day summary report for the active event. */
export interface EndOfDayReport {
  /** ID of the event this report covers. */
  event_id: number
  /** Name of the event. */
  event_name: string
  /** Calendar date this report covers, as YYYY-MM-DD. */
  date_generated: string
  /** Number of non-voided sales processed on this day. */
  sales_count: number
  /** Number of voided sales on this day. */
  voided_count: number
  /** Total revenue from non-voided sales on this day. */
  gross_revenue: number
  /** MYSL's commission share of today's gross revenue. */
  mysl_total: number
  /** Total owed to sellers from today's sales. */
  seller_total: number
  /** Total cash received today. */
  cash_total: number
  /** Total check payments received today. */
  check_total: number
  /** Total credit/debit card payments received today via Square. */
  cc_total: number
  /** ISO 8601 timestamp when this report was generated. */
  generated_at: string
}
