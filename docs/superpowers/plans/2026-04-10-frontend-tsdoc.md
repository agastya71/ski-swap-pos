# Frontend TSDoc Inline Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TSDoc-style `/** */` comments to all 54 frontend source and test files so developers get VS Code hover documentation on every exported symbol and can understand each module without reading the implementation.

**Architecture:** Two sequential phases. Phase 1 documents the shared foundation (`types.ts` + 9 `api/` files) so Phase 2 agents have an established vocabulary. Phase 2 runs four parallel agents covering auth/shell, intake, POS, and admin+mocks — each agent owns non-overlapping files so there are no merge conflicts.

**Tech Stack:** TypeScript, React 18, Vitest, MSW 2, TSDoc comment syntax (`/** */`)

**Style guide:** `docs/superpowers/specs/2026-04-10-frontend-tsdoc-design.md`

---

## File Map (all 54 modified — no new files)

| Phase | Task | Files |
|---|---|---|
| Setup | 0 | (branch only) |
| 1 | 1 | `src/types.ts` |
| 1 | 2 | `src/api/client.ts` |
| 1 | 3 | `src/api/auth.ts` |
| 1 | 4 | `src/api/events.ts` |
| 1 | 5 | `src/api/sellers.ts`, `src/api/users.ts` |
| 1 | 6 | `src/api/intakes.ts`, `src/api/items.ts` |
| 1 | 7 | `src/api/sales.ts`, `src/api/reports.ts` |
| 2-A | 8 | `src/auth/AuthContext.tsx`, `src/auth/LoginPage.tsx`, `src/auth/LoginPage.test.tsx`, `src/components/Layout.tsx`, `src/components/ProtectedRoute.tsx`, `src/App.tsx`, `src/main.tsx`, `src/test-setup.ts` |
| 2-B | 9 | All 12 files in `src/intake/` (6 source + 6 test) |
| 2-C | 10 | All 11 files in `src/pos/` (6 source + 5 test) |
| 2-D | 11 | All 13 files in `src/admin/` + `src/mocks/` (5 source + 5 test + 3 mock) |
| Verify | 12 | (tests + PR) |

---

## Task 0: Create feature branch

- [ ] **Step 1: Create branch from main**

```bash
git checkout main && git pull
git checkout -b docs/frontend-tsdoc
```

Expected: `Switched to a new branch 'docs/frontend-tsdoc'`

---

## Phase 1 — Foundation (Tasks 1–7, sequential)

> All Phase 1 tasks commit directly to `docs/frontend-tsdoc`. Complete all Phase 1 tasks before starting Phase 2.

---

## Task 1: Document `src/types.ts`

**Files:**
- Modify: `frontend/src/types.ts`

Every field in every interface gets a one-line `/** */` TSDoc comment. Non-obvious domain fields (`donate_proceeds`, `commission_rate`, `mysl_total`, `donate_unsold`) get explicit business-rule explanations. Self-evident fields (`id`, `created_at`) get brief comments.

- [ ] **Step 1: Replace the file with the fully-documented version**

```ts
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
  /** Short seller code, e.g. "A001". Must be unique within the event. */
  code: string
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

/** Payload for adding a new item to an intake session. */
export interface ItemCreate {
  /** Unique item code within the event, e.g. "A001-003". */
  code: string
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
```

- [ ] **Step 2: Verify no regressions**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass (no logic was changed)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "docs: add TSDoc to all shared type interfaces (types.ts)"
```

---

## Task 2: Document `src/api/client.ts`

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Replace file with documented version**

```ts
/**
 * Shared API client — in-memory token cache, localStorage persistence,
 * and authenticated fetch wrapper used by all api/ modules.
 */

/** localStorage key under which the JWT is persisted between page loads. */
const TOKEN_KEY = 'auth_token'

/** In-memory token cache. `undefined` = not yet read from storage; `null` = signed out. */
let _token: string | null | undefined = undefined

/**
 * Store a JWT in memory and persist it to localStorage.
 * Pass `null` to clear the token on sign-out.
 *
 * @param t - JWT string to store, or `null` to clear.
 */
export function setToken(t: string | null) {
  _token = t
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* non-browser environment */ }
}

/**
 * Return the current JWT, loading it from localStorage on first call.
 *
 * @returns The stored JWT string, or `null` if no token is present.
 */
export function getToken(): string | null {
  if (_token === undefined) {
    try { _token = localStorage.getItem(TOKEN_KEY) }
    catch { _token = null }
  }
  return _token
}

/**
 * Error thrown by {@link apiFetch} for non-2xx HTTP responses.
 * Inspect {@link ApiError.status} to branch on specific codes —
 * e.g. 401 for session expiry, 404 for missing resources, 409 for conflicts.
 */
export class ApiError extends Error {
  /**
   * @param status - HTTP status code returned by the server.
   * @param message - `detail` field from the error response body, or the HTTP status text.
   */
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Authenticated fetch wrapper for all backend API calls.
 * Automatically injects the Bearer token and Content-Type header.
 * Parses the response body as JSON, or returns `undefined` for 204 No Content.
 *
 * @param path - API path relative to the origin, e.g. `/sellers?q=smith`.
 * @param init - Optional fetch init overrides (method, body, additional headers).
 * @returns Parsed JSON response cast to `T`.
 * @throws {ApiError} For any non-2xx HTTP response.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, (body as { detail?: string }).detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/client.ts
git commit -m "docs: add TSDoc to api/client.ts"
```

---

## Task 3: Document `src/api/auth.ts`

**Files:**
- Modify: `frontend/src/api/auth.ts`

- [ ] **Step 1: Replace file with documented version**

```ts
/**
 * Authentication API — POST /auth/login.
 * Unlike other api/ modules, login does not use {@link apiFetch} because
 * no Bearer token exists before the user authenticates.
 */
import type { TokenResponse } from '../types'

/**
 * Authenticate with the backend and return a JWT access token.
 *
 * @param username - The user's login username.
 * @param password - The user's plaintext password.
 * @returns Token response containing the JWT, role, and active event ID.
 * @throws {Error} If credentials are invalid or the server returns a non-2xx response.
 */
export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new Error((data as { detail?: string }).detail ?? 'Login failed')
  }
  return res.json() as Promise<TokenResponse>
}
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/auth.ts
git commit -m "docs: add TSDoc to api/auth.ts"
```

---

## Task 4: Document `src/api/events.ts`

**Files:**
- Modify: `frontend/src/api/events.ts`

- [ ] **Step 1: Replace file with documented version**

```ts
/**
 * Events API — list, create, and activate swap events.
 * All operations require admin role.
 */
import { apiFetch } from './client'
import type { Event, EventCreate } from '../types'

/**
 * Fetch all swap events, ordered by year.
 *
 * @returns Array of all Event records (active and inactive).
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getEvents = () => apiFetch<Event[]>('/events')

/**
 * Create a new swap event.
 *
 * @param data - Event name, year, and commission rate.
 * @returns The newly created Event record.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createEvent = (data: EventCreate) =>
  apiFetch<Event>('/events', { method: 'POST', body: JSON.stringify(data) })

/**
 * Activate an event, making it the current active event for all operations.
 * Only one event can be active at a time; activating one deactivates any currently active event.
 *
 * @param id - Primary key of the event to activate.
 * @returns The updated Event record with `is_active: true`.
 * @throws {ApiError} 404 if no event with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const activateEvent = (id: number) =>
  apiFetch<Event>(`/events/${id}/activate`, { method: 'POST' })
```

- [ ] **Step 2: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/events.ts
git commit -m "docs: add TSDoc to api/events.ts"
```

---

## Task 5: Document `src/api/sellers.ts` and `src/api/users.ts`

**Files:**
- Modify: `frontend/src/api/sellers.ts`
- Modify: `frontend/src/api/users.ts`

- [ ] **Step 1: Replace `sellers.ts` with documented version**

```ts
/**
 * Sellers API — search, fetch, register, and update consignment sellers.
 * Requires admin or intake role.
 */
import { apiFetch } from './client'
import type { Seller, SellerCreate, SellerUpdate } from '../types'

/**
 * Search sellers by partial code, first/last name, or company.
 *
 * @param q - Search string matched against seller code and name fields.
 * @returns Array of matching Seller records for the active event.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const searchSellers = (q: string) =>
  apiFetch<Seller[]>(`/sellers?q=${encodeURIComponent(q)}`)

/**
 * Fetch a single seller by primary key.
 *
 * @param id - Primary key of the seller to retrieve.
 * @returns The matching Seller record.
 * @throws {ApiError} 404 if no seller with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSeller = (id: number) => apiFetch<Seller>(`/sellers/${id}`)

/**
 * Register a new consignment seller for the active event.
 *
 * @param data - Seller details including required code, first name, and last name.
 * @returns The newly created Seller record.
 * @throws {ApiError} 409 if a seller with the same code already exists for this event.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createSeller = (data: SellerCreate) =>
  apiFetch<Seller>('/sellers', { method: 'POST', body: JSON.stringify(data) })

/**
 * Update a seller's contact details.
 *
 * @param id - Primary key of the seller to update.
 * @param data - Partial seller fields to update.
 * @returns The updated Seller record.
 * @throws {ApiError} 404 if no seller with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const updateSeller = (id: number, data: SellerUpdate) =>
  apiFetch<Seller>(`/sellers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
```

- [ ] **Step 2: Replace `users.ts` with documented version**

```ts
/**
 * Users API — list, create, and deactivate event user accounts.
 * Requires admin role.
 */
import { apiFetch } from './client'
import type { User, UserCreate } from '../types'

/**
 * Fetch all user accounts for the active event.
 *
 * @returns Array of all User records (active and inactive).
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getUsers = () => apiFetch<User[]>('/users')

/**
 * Create a new user account for the active event.
 *
 * @param data - Username, plaintext password, and role.
 * @returns The newly created User record.
 * @throws {ApiError} 409 if a user with the same username already exists for this event.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createUser = (data: UserCreate) =>
  apiFetch<User>('/users', { method: 'POST', body: JSON.stringify(data) })

/**
 * Deactivate a user account, preventing future logins.
 * The record is retained — deactivated users still appear in the admin list with `is_active: false`.
 *
 * @param id - Primary key of the user to deactivate.
 * @returns The updated User record with `is_active: false`.
 * @throws {ApiError} 404 if no user with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const deactivateUser = (id: number) =>
  apiFetch<User>(`/users/${id}/deactivate`, { method: 'PATCH' })
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/sellers.ts frontend/src/api/users.ts
git commit -m "docs: add TSDoc to api/sellers.ts and api/users.ts"
```

---

## Task 6: Document `src/api/intakes.ts` and `src/api/items.ts`

**Files:**
- Modify: `frontend/src/api/intakes.ts`
- Modify: `frontend/src/api/items.ts`

- [ ] **Step 1: Replace `intakes.ts` with documented version**

```ts
/**
 * Intakes API — create and manage seller intake sessions and add items.
 * Requires admin or intake role.
 */
import { apiFetch } from './client'
import type { Intake, IntakeWithItems, IntakeCreate, IntakeUpdate, Item, ItemCreate } from '../types'

/**
 * Fetch all intake sessions for a given seller in the active event.
 *
 * @param sellerId - Primary key of the seller.
 * @returns Array of Intake records for that seller.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSellerIntakes = (sellerId: number) =>
  apiFetch<Intake[]>(`/sellers/${sellerId}/intakes`)

/**
 * Create a new intake session for a seller.
 *
 * @param data - Seller ID and optional intake options (dates, donation flags).
 * @returns The newly created Intake record.
 * @throws {ApiError} 404 if the referenced seller does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createIntake = (data: IntakeCreate) =>
  apiFetch<Intake>('/intakes', { method: 'POST', body: JSON.stringify(data) })

/**
 * Fetch a single intake session with all its items eagerly loaded.
 *
 * @param id - Primary key of the intake to retrieve.
 * @returns The matching IntakeWithItems (intake metadata + items array).
 * @throws {ApiError} 404 if no intake with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getIntake = (id: number) =>
  apiFetch<IntakeWithItems>(`/intakes/${id}`)

/**
 * Update an intake session's donation flags or received date.
 *
 * @param id - Primary key of the intake to update.
 * @param data - Partial intake fields to update.
 * @returns The updated Intake record.
 * @throws {ApiError} 404 if no intake with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const updateIntake = (id: number, data: IntakeUpdate) =>
  apiFetch<Intake>(`/intakes/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

/**
 * Add a new item to an existing intake session.
 *
 * @param intakeId - Primary key of the intake to add the item to.
 * @param data - Item details including required code and price.
 * @returns The newly created Item record.
 * @throws {ApiError} 409 if an item with the same code already exists for this event.
 * @throws {ApiError} 404 if the referenced intake does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const addItem = (intakeId: number, data: ItemCreate) =>
  apiFetch<Item>(`/intakes/${intakeId}/items`, { method: 'POST', body: JSON.stringify(data) })

/**
 * Send all unprinted item labels in an intake session to the ZPL label printer.
 *
 * @param intakeId - Primary key of the intake whose labels should be printed.
 * @returns Object with `intake_id` and `printed` count of labels sent to the printer.
 * @throws {ApiError} 404 if the referenced intake does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const printIntakeLabels = (intakeId: number) =>
  apiFetch<{ intake_id: number; printed: number }>(`/intakes/${intakeId}/labels`, { method: 'POST' })
```

- [ ] **Step 2: Replace `items.ts` with documented version**

```ts
/**
 * Items API — fetch, update, delete, and look up individual consignment items.
 * Lookup and search are available to all roles; write operations require admin or intake.
 */
import { apiFetch } from './client'
import type { Item, ItemUpdate, ItemLookupResponse } from '../types'

/**
 * Fetch a single item by primary key.
 *
 * @param id - Primary key of the item to retrieve.
 * @returns The matching Item record.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getItem = (id: number) => apiFetch<Item>(`/items/${id}`)

/**
 * Update an existing item's fields.
 *
 * @param id - Primary key of the item to update.
 * @param data - Partial item fields to update.
 * @returns The updated Item record.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const updateItem = (id: number, data: ItemUpdate) =>
  apiFetch<Item>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

/**
 * Permanently delete an item record.
 * Only permitted for items that have not been sold.
 *
 * @param id - Primary key of the item to delete.
 * @throws {ApiError} 409 if the item has already been sold.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const deleteItem = (id: number) =>
  apiFetch<void>(`/items/${id}`, { method: 'DELETE' })

/**
 * Send a ZPL barcode label for one item to the label printer.
 *
 * @param id - Primary key of the item whose label should be printed.
 * @returns The updated Item record with `label_printed: true`.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const printLabel = (id: number) =>
  apiFetch<Item>(`/items/${id}/label`, { method: 'POST' })

/**
 * Exact-match item lookup by code — the fast path for barcode scanners.
 *
 * @param code - Exact item code to look up, e.g. "A001-003".
 * @returns The matching ItemLookupResponse (item fields + seller_code).
 * @throws {ApiError} 404 if no item with that exact code exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const lookupItem = (code: string) =>
  apiFetch<ItemLookupResponse>(`/items/lookup?code=${encodeURIComponent(code)}`)

/**
 * Partial-match item search — autocomplete path for manual code entry.
 * Returns items whose code, description, or category contain the query string.
 *
 * @param q - Search string (partial code, description, or category).
 * @returns Array of matching ItemLookupResponse records; may be empty.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const searchItems = (q: string) =>
  apiFetch<ItemLookupResponse[]>(`/items/search?q=${encodeURIComponent(q)}`)
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/intakes.ts frontend/src/api/items.ts
git commit -m "docs: add TSDoc to api/intakes.ts and api/items.ts"
```

---

## Task 7: Document `src/api/sales.ts` and `src/api/reports.ts`

**Files:**
- Modify: `frontend/src/api/sales.ts`
- Modify: `frontend/src/api/reports.ts`

- [ ] **Step 1: Replace `sales.ts` with documented version**

```ts
/**
 * Sales API — create, fetch, and void point-of-sale transactions.
 * Requires cashier or admin role.
 */
import { apiFetch } from './client'
import type { SaleWithItemsResponse, SaleCreate } from '../types'

/**
 * Create a new sale transaction.
 * Marks all included items as sold and calculates commission splits.
 *
 * @param data - Items, payment amounts, and optional customer details.
 * @returns The completed SaleWithItemsResponse including all line items and totals.
 * @throws {ApiError} 409 if any included item is not in 'available' status.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createSale = (data: SaleCreate) =>
  apiFetch<SaleWithItemsResponse>('/sales', { method: 'POST', body: JSON.stringify(data) })

/**
 * Fetch a completed sale by primary key.
 *
 * @param id - Primary key of the sale to retrieve.
 * @returns The SaleWithItemsResponse including all line items.
 * @throws {ApiError} 404 if no sale with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSale = (id: number) => apiFetch<SaleWithItemsResponse>(`/sales/${id}`)

/**
 * Void a sale, returning all its line items to 'available' status so they can be re-sold.
 *
 * @param id - Primary key of the sale to void.
 * @returns The updated SaleWithItemsResponse with `is_voided: true`.
 * @throws {ApiError} 404 if no sale with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const voidSale = (id: number) =>
  apiFetch<SaleWithItemsResponse>(`/sales/${id}/void`, { method: 'POST' })
```

- [ ] **Step 2: Replace `reports.ts` with documented version**

```ts
/**
 * Reports API — fetch financial and inventory reports for an event.
 * All report fetch endpoints require admin role.
 * {@link downloadFile} is a shared utility for browser file downloads.
 */
import { apiFetch, getToken } from './client'
import type {
  SellerPayoutReport,
  EventRevenueReport,
  DonationsReport,
  UnsoldItemsReport,
  EndOfDayReport,
} from '../types'

/**
 * Fetch the payout report for a single seller.
 *
 * @param eventId - ID of the event to report on.
 * @param sellerId - ID of the seller to generate a payout for.
 * @returns Full SellerPayoutReport with per-item line items and commission totals.
 * @throws {ApiError} 404 if the event or seller does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSellerPayout = (eventId: number, sellerId: number) =>
  apiFetch<SellerPayoutReport>(`/reports/${eventId}/seller/${sellerId}`)

/**
 * Fetch the aggregate revenue report for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns EventRevenueReport with totals by payment type and commission split.
 * @throws {ApiError} 404 if the event does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getEventRevenue = (eventId: number) =>
  apiFetch<EventRevenueReport>(`/reports/${eventId}/revenue`)

/**
 * Fetch the donations report listing all donated items for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns DonationsReport with all items donated by either mechanism (donate_unsold or donate_proceeds).
 * @throws {ApiError} 404 if the event does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getDonations = (eventId: number) =>
  apiFetch<DonationsReport>(`/reports/${eventId}/donations`)

/**
 * Fetch the unsold inventory report for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns UnsoldItemsReport listing all items still in 'available' or 'returned' status.
 * @throws {ApiError} 404 if the event does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getUnsoldItems = (eventId: number) =>
  apiFetch<UnsoldItemsReport>(`/reports/${eventId}/unsold`)

/**
 * Fetch the end-of-day summary report for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns EndOfDayReport with today's sales counts, revenue, and payment breakdown.
 * @throws {ApiError} 404 if the event does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getEndOfDay = (eventId: number) =>
  apiFetch<EndOfDayReport>(`/reports/${eventId}/end-of-day`)

/**
 * Trigger an authenticated file download (CSV, PDF, or Markdown report).
 * Creates a temporary anchor element to initiate the browser download dialog,
 * then cleans it up immediately.
 *
 * @param path - Absolute API path for the download endpoint, e.g. `/reports/1/end-of-day?format=csv`.
 * @param filename - Suggested filename for the download dialog, e.g. "end-of-day.csv".
 * @param method - HTTP method for the request; defaults to 'GET'.
 * @throws {Error} If the server returns a non-2xx response.
 */
export async function downloadFile(
  path: string,
  filename: string,
  method: 'GET' | 'POST' = 'GET'
): Promise<void> {
  const token = getToken()
  const res = await fetch(path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 3: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 4: Commit Phase 1 complete**

```bash
git add frontend/src/api/sales.ts frontend/src/api/reports.ts
git commit -m "docs: add TSDoc to api/sales.ts and api/reports.ts — Phase 1 complete"
```

---

## Phase 2 — Parallel Modules (Tasks 8–11)

> Tasks 8, 9, 10, and 11 run **in parallel**. Each agent:
> 1. Checks out `docs/frontend-tsdoc` (all Phase 1 commits must be present first)
> 2. Reads `frontend/src/types.ts` and `frontend/src/api/client.ts` as vocabulary reference
> 3. Reads the spec at `docs/superpowers/specs/2026-04-10-frontend-tsdoc-design.md` for style rules
> 4. Documents its assigned files, verifies, and commits

> No merge conflicts: each agent owns non-overlapping directories.

---

## Task 8 (Agent A): Document Auth + Shell

**Files:**
- Modify: `frontend/src/auth/AuthContext.tsx`
- Modify: `frontend/src/auth/LoginPage.tsx`
- Modify: `frontend/src/auth/LoginPage.test.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/components/ProtectedRoute.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/test-setup.ts`

- [ ] **Step 1: Document `AuthContext.tsx`**

Replace with the fully-documented version:

```ts
/**
 * Authentication context — provides the current JWT, decoded token payload,
 * and sign-in/sign-out actions to all components in the React tree.
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { jwtDecode } from 'jwt-decode'
import { setToken, getToken } from '../api/client'
import type { DecodedToken } from '../types'

/** Shape of the value provided by {@link AuthContext}. */
interface AuthContextValue {
  /** Current raw JWT string, or `null` if not signed in. */
  token: string | null
  /** Decoded JWT payload containing role and event_id, or `null` if not signed in. */
  decoded: DecodedToken | null
  /** Store a new JWT and update the decoded payload. */
  signIn: (token: string) => void
  /** Clear the JWT and decoded payload (sign out). */
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Attempt to restore a previously stored JWT from localStorage.
 * Returns the token if valid and not expired; clears and returns null otherwise.
 *
 * @returns The stored valid JWT string, or `null`.
 */
function tryRestoreToken(): string | null {
  const t = getToken()
  if (!t) return null
  try {
    const d = jwtDecode<DecodedToken>(t)
    if (d.exp * 1000 > Date.now()) return t
  } catch { /* malformed token */ }
  setToken(null) // clear expired/invalid token
  return null
}

/**
 * Provides auth state and auth actions to the entire component tree.
 * On mount, restores any valid JWT that was persisted to localStorage.
 *
 * @param props.children - React subtree that receives auth context.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => tryRestoreToken())
  const [decoded, setDecoded] = useState<DecodedToken | null>(() => {
    const t = tryRestoreToken()
    return t ? jwtDecode<DecodedToken>(t) : null
  })

  /** Persist a new JWT and update both raw and decoded state. */
  function signIn(t: string) {
    setToken(t)
    setTokenState(t)
    setDecoded(jwtDecode<DecodedToken>(t))
  }

  /** Clear the JWT from storage and reset auth state to signed-out. */
  function signOut() {
    setToken(null)
    setTokenState(null)
    setDecoded(null)
  }

  return (
    <AuthContext.Provider value={{ token, decoded, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook that returns the current {@link AuthContextValue}.
 * Must be called within an {@link AuthProvider} — throws if used outside one.
 *
 * @returns Object with `token`, `decoded`, `signIn`, and `signOut`.
 * @throws {Error} If called outside of an AuthProvider tree.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Document `LoginPage.tsx`**

Read the file first, then add:
- File-level comment: `"Login page — credential form for all user roles. Calls the auth API and stores the returned JWT via AuthContext on success."`
- Component comment: summary line + `@param props.onLogin` if a prop exists, or note that it uses `useAuth().signIn` internally
- One-line `/** */` above each `useState` call explaining what state it holds
- One-line `/** */` above the submit handler

- [ ] **Step 3: Document `LoginPage.test.tsx`**

Read the file first, then add file header + per-`describe` + per-`it` comments following this pattern:

```tsx
/**
 * Tests for LoginPage — covers form rendering, successful login storing the token,
 * error display on wrong credentials, and disabled state during submission.
 */

describe('LoginPage', () => {
  /** Renders username and password inputs plus a submit button. */
  it('renders the login form', () => { ... })

  /** Calls signIn with the returned token after a successful API response. */
  it('signs in on successful authentication', async () => { ... })

  /** Displays the error detail from the API response on login failure. */
  it('shows error message on wrong credentials', async () => { ... })
})
```

- [ ] **Step 4: Document `Layout.tsx`**

Read the file first, then add:
- File-level comment: `"Application shell — top navigation bar with MYXC branding, role-aware nav links, and a sign-out button. Wraps all protected pages via React Router Outlet."`
- Component comment: summary + `@param props.children` if it accepts children, otherwise note it uses `<Outlet />`

- [ ] **Step 5: Document `ProtectedRoute.tsx`**

Read the file first, then add:
- File-level comment: `"Route guard that redirects unauthenticated users to /login before rendering protected content."`
- Component comment: `"Renders its child route if the user is authenticated; redirects to /login otherwise. Uses {@link useAuth} to check for a valid token."`

- [ ] **Step 6: Document `App.tsx`**

Read the file first, then add:
- File-level comment: `"Root application component — mounts AuthProvider, BrowserRouter, and top-level routes mapping paths to module pages."`
- Component comment (if exported): summary line noting the route structure (/, /intake, /admin, /pos, /login)

- [ ] **Step 7: Document `main.tsx`**

Add:
- File-level comment: `"Application entry point — mounts the React root component into the #root DOM element."`

- [ ] **Step 8: Document `test-setup.ts`**

Read the file first, then add:
- File-level comment: `"Vitest global test setup — extends expect with @testing-library/jest-dom matchers and manages the MSW mock server lifecycle (start before all tests, reset handlers between tests, close after all tests)."`

- [ ] **Step 9: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 10: Commit**

```bash
git add frontend/src/auth/ frontend/src/components/ frontend/src/App.tsx frontend/src/main.tsx frontend/src/test-setup.ts
git commit -m "docs: add TSDoc to auth, components, and app shell"
```

---

## Task 9 (Agent B): Document Intake Module

**Files:**
- Modify: `frontend/src/intake/IntakePage.tsx`
- Modify: `frontend/src/intake/IntakeForm.tsx`
- Modify: `frontend/src/intake/ItemForm.tsx`
- Modify: `frontend/src/intake/ItemList.tsx`
- Modify: `frontend/src/intake/SellerForm.tsx`
- Modify: `frontend/src/intake/SellerSearch.tsx`
- Modify: `frontend/src/intake/IntakePage.test.tsx`
- Modify: `frontend/src/intake/IntakeForm.test.tsx`
- Modify: `frontend/src/intake/ItemForm.test.tsx`
- Modify: `frontend/src/intake/ItemList.test.tsx`
- Modify: `frontend/src/intake/SellerForm.test.tsx`
- Modify: `frontend/src/intake/SellerSearch.test.tsx`

Read each file before editing it.

- [ ] **Step 1: Document `IntakePage.tsx`**

Add file-level comment:

```ts
/**
 * Intake module root — manages the multi-step seller intake workflow:
 * seller search → seller registration → intake selection → intake creation → item entry.
 * All step state is lifted here; child components are pure presentational forms.
 */
```

Document `Breadcrumb` (private component):

```ts
/**
 * Navigation breadcrumb for the intake workflow.
 * Renders clickable links for completed steps and a plain label for the current step.
 *
 * @param props.step - Current workflow step name.
 * @param props.seller - Selected seller, or null if none selected yet.
 * @param props.intake - Active intake session, or null if none started yet.
 * @param props.onGoToSearch - Callback to return to the seller search step.
 * @param props.onGoToSelectIntake - Callback to return to the intake selection step.
 */
function Breadcrumb(...)
```

Document `IntakePage` and add one-line `/** */` above each internal handler (`goToSelectIntake`, `handleSellerSelected`, `handleSellerCreated`, `handlePickExistingIntake`, `handleIntakeCreated`, `handleGoToSearch`, `handleGoToSelectIntake`, `handleItemAdded`, `refreshItems`).

- [ ] **Step 2: Document `IntakeForm.tsx`**

Add file-level comment:

```ts
/**
 * Intake session creation form — captures donation preferences
 * (donate_unsold, donate_proceeds) and submits to the intakes API.
 */
```

Read the file to find the props interface name, then document it and the component:

```ts
/**
 * Form for starting a new intake session for a seller.
 * Submits via {@link createIntake} and calls onCreated on success.
 *
 * @param props.seller - The seller whose items are being taken in.
 * @param props.onCreated - Callback fired with the new Intake on success.
 */
export function IntakeForm(...)
```

- [ ] **Step 3: Document `ItemForm.tsx`**

Add file-level comment:

```ts
/**
 * Item entry form — captures all fields for a single consignment item
 * and adds it to the current intake session via the items API.
 * Auto-generates the item code from the seller code and current item count.
 */
```

Document the component:

```ts
/**
 * Form for adding a new item to an intake session.
 * Auto-generates the item code (e.g. "A001-003") from sellerCode + itemCount.
 * Submits via {@link addItem} and calls onAdded on success.
 *
 * @param props.intakeId - ID of the intake session to add the item to.
 * @param props.onAdded - Callback fired with the new Item on success.
 * @param props.sellerCode - Seller's short code, used to prefix auto-generated item codes.
 * @param props.itemCount - Current item count in this intake, used to generate the item sequence number.
 */
export function ItemForm(...)
```

- [ ] **Step 4: Document `ItemList.tsx`**

Add file-level comment:

```ts
/**
 * Item list table for an intake session — displays all consigned items with
 * inline edit (modal), delete (with sold-item guard), and print-label actions.
 */
```

Document the component:

```ts
/**
 * Tabular list of items in an intake session.
 * Provides per-row edit, delete, and label-print actions.
 * Calls onItemsChanged after any mutation so the parent can refresh.
 *
 * @param props.items - Items to display.
 * @param props.intakeId - ID of the parent intake session (for label printing).
 * @param props.onItemsChanged - Callback fired after any item is edited, deleted, or label-printed.
 */
export function ItemList(...)
```

- [ ] **Step 5: Document `SellerForm.tsx`**

Add file-level comment:

```ts
/**
 * New seller registration form — collects required fields (code, first/last name)
 * and optional contact details, then submits via the sellers API.
 */
```

Document the component:

```ts
/**
 * Form for registering a new consignment seller.
 * Submits via {@link createSeller} and calls onCreated on success.
 *
 * @param props.onCreated - Callback fired with the new Seller on success.
 * @param props.onCancel - Callback fired when the user cancels.
 */
export function SellerForm(...)
```

- [ ] **Step 6: Document `SellerSearch.tsx`**

Add file-level comment:

```ts
/**
 * Seller search input — debounced live search against the sellers API (300 ms),
 * with a results dropdown and a "Register New Seller" fallback action.
 */
```

Document the component:

```ts
/**
 * Live search field for finding existing sellers by code or name.
 * Debounces API calls at 300 ms. Selecting a result fires onSelect.
 *
 * @param props.onSelect - Callback fired with the chosen Seller.
 * @param props.onCreateNew - Callback fired when the user clicks "Register New Seller".
 */
export function SellerSearch(...)
```

- [ ] **Step 7: Document all 6 intake test files**

For each test file, read it first, then add:
1. A file-level `/** */` block naming what is tested and the key scenarios covered.
2. A `/** */` comment above each `describe()` block.
3. A `/** */` comment above each `it()` / `test()` call.

Example for `IntakeForm.test.tsx`:

```tsx
/**
 * Tests for IntakeForm — covers form rendering with seller details, donate_unsold
 * and donate_proceeds checkbox defaults, successful intake creation, and API error display.
 */

describe('IntakeForm', () => {
  /** Renders the seller's name in the form heading. */
  it('shows seller name', () => { ... })

  /** donate_unsold checkbox is unchecked by default. */
  it('donate_unsold defaults to false', () => { ... })

  /** Submitting calls createIntake with the correct seller_id and donation flags. */
  it('calls createIntake on submit', async () => { ... })

  /** Calls onCreated with the returned intake on success. */
  it('calls onCreated after successful submission', async () => { ... })
})
```

Apply the same three-level pattern to `IntakePage.test.tsx`, `ItemForm.test.tsx`, `ItemList.test.tsx`, `SellerForm.test.tsx`, and `SellerSearch.test.tsx` — read each file to write accurate descriptions.

- [ ] **Step 8: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add frontend/src/intake/
git commit -m "docs: add TSDoc to intake module (source and tests)"
```

---

## Task 10 (Agent C): Document POS Module

**Files:**
- Modify: `frontend/src/pos/POSPage.tsx`
- Modify: `frontend/src/pos/LookupField.tsx`
- Modify: `frontend/src/pos/Cart.tsx`
- Modify: `frontend/src/pos/ConfirmationScreen.tsx`
- Modify: `frontend/src/pos/PaymentForm.tsx`
- Modify: `frontend/src/pos/SquarePayment.tsx`
- Modify: `frontend/src/pos/Cart.test.tsx`
- Modify: `frontend/src/pos/ConfirmationScreen.test.tsx`
- Modify: `frontend/src/pos/LookupField.test.tsx`
- Modify: `frontend/src/pos/PaymentForm.test.tsx`
- Modify: `frontend/src/pos/POSPage.test.tsx`

Read each file before editing it.

- [ ] **Step 1: Document `POSPage.tsx`**

Add file-level comment:

```ts
/**
 * POS checkout page — orchestrates the three-step checkout flow:
 * item lookup/cart building → payment entry → confirmation.
 * Cart items are persisted to localStorage under the key 'pos_cart'
 * so they survive page refresh.
 */
```

Document the component and internal functions:

```ts
/**
 * Root component for the point-of-sale checkout workflow.
 * Manages cart state, checkout step, Square token, and sale submission.
 *
 * Step progression: 'cart' → 'payment' → 'confirmed'
 */
export function POSPage()

/** Update cart state and sync to localStorage. Accepts a value or updater function. */
function setItems(...)

/** Add a looked-up available item to the cart. */
function handleFound(item: ItemLookupResponse)

/** Remove an item from the cart by its primary key. */
function handleRemove(id: number)

/** Submit payment amounts, create the sale via API, and advance to 'confirmed'. */
async function handlePayment({ cash, check, square }: ...)

/** Reset all state and return to the cart step for a new transaction. */
function handleNewTransaction()
```

- [ ] **Step 2: Document `LookupField.tsx`**

Add file-level comment:

```ts
/**
 * Item code lookup field for the POS checkout screen.
 * Supports three input modes:
 * 1. Barcode scanner — fires lookupItem (exact match) on Enter.
 * 2. Partial code typing — fires searchItems with 300 ms debounce, shows autocomplete dropdown.
 * 3. Keyboard navigation — ArrowUp/Down to highlight dropdown rows, Enter to select, Escape to dismiss.
 */
```

Document the component and internal functions:

```ts
/**
 * Input for scanning or typing item codes during POS checkout.
 * Calls onFound when a valid available item is selected by any input method.
 *
 * @param props.onFound - Called with the matched ItemLookupResponse when an available item is selected.
 */
export function LookupField(...)

/** Handle all keyboard events: arrow navigation, Enter (lookup/select), Escape (dismiss). */
async function handleKeyDown(e: KeyboardEvent<HTMLInputElement>)

/** Select a result from the dropdown; validates it is available before calling onFound. */
function handleSelectResult(item: ItemLookupResponse)
```

- [ ] **Step 3: Document `Cart.tsx`**

Add file-level comment:

```ts
/**
 * Cart table — displays items added to the current POS transaction,
 * with a per-row Remove button and a running subtotal row.
 */
```

Document the component:

```ts
/**
 * Read-only cart summary for the checkout screen.
 *
 * @param props.items - Items currently in the cart.
 * @param props.onRemove - Called with the item's ID when its Remove button is clicked.
 */
export function Cart(...)
```

- [ ] **Step 4: Document `ConfirmationScreen.tsx`**

Add file-level comment:

```ts
/**
 * Post-sale confirmation screen — displays a receipt summary after a successful
 * transaction and provides a "New Transaction" button to reset the POS.
 */
```

Document the component:

```ts
/**
 * Receipt view shown after a sale is successfully created.
 *
 * @param props.sale - The completed SaleWithItemsResponse to display.
 * @param props.onNewTransaction - Called when the cashier is ready to start a new transaction.
 */
export function ConfirmationScreen(...)
```

- [ ] **Step 5: Document `PaymentForm.tsx`**

Add file-level comment:

```ts
/**
 * Payment entry form — splits tender across cash, check, and Square card,
 * validates that the total tendered meets the sale total, and submits.
 */
```

Document the component:

```ts
/**
 * Form for entering payment amounts for a POS sale.
 * The submit button is disabled until cash + check + card ≥ total.
 *
 * @param props.total - Sale total in dollars; minimum amount that must be tendered.
 * @param props.squareToken - Square payment token if card was processed; null otherwise.
 * @param props.onSubmit - Called with cash/check/square amounts on valid submission.
 * @param props.onCancel - Called when the cashier cancels and returns to the cart.
 */
export function PaymentForm(...)
```

- [ ] **Step 6: Document `SquarePayment.tsx`**

Add file-level comment:

```ts
/**
 * Square Web Payments SDK integration — renders the Square card entry iframe
 * and tokenizes card details for use in sale submission.
 * Degrades gracefully when the Square SDK is unavailable (e.g. network blocked in testing).
 */
```

Document the component:

```ts
/**
 * Embeds the Square card payment form and returns a one-time payment token on success.
 * If the Square SDK fails to initialize, renders an informational fallback message.
 *
 * @param props.onToken - Called with the Square payment nonce on successful tokenization.
 * @param props.onError - Called with an error message string on tokenization failure.
 */
export function SquarePayment(...)
```

- [ ] **Step 7: Document all 5 POS test files**

For each test file, read it first, then add:
1. A file-level `/** */` block describing what is tested and the scenarios covered.
2. A `/** */` comment above each `describe()` block.
3. A `/** */` comment above each `it()` / `test()` call.

Example for `LookupField.test.tsx`:

```tsx
/**
 * Tests for LookupField — covers initial render, barcode scan (exact-match fast path),
 * partial code autocomplete dropdown (300 ms debounce, ≥3 chars),
 * keyboard navigation (ArrowDown/Up, Enter to select, Escape to dismiss),
 * and error states (item not found, item already sold).
 */

describe('LookupField', () => {
  describe('initial render', () => {
    /** Renders the label and text input on mount. */
    it('renders label and input', () => { ... })
    /** Input receives focus automatically on mount. */
    it('auto-focuses the input', () => { ... })
  })

  describe('barcode scan path', () => {
    /** Pressing Enter with an exact item code calls onFound with the matched item. */
    it('calls onFound on exact code match', async () => { ... })
    /** Shows an error and clears input if the matched item is not available. */
    it('shows error if item is already sold', async () => { ... })
  })
})
```

Apply the same three-level pattern to `Cart.test.tsx`, `ConfirmationScreen.test.tsx`, `PaymentForm.test.tsx`, and `POSPage.test.tsx` — read each file to write accurate descriptions.

- [ ] **Step 8: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pos/
git commit -m "docs: add TSDoc to POS module (source and tests)"
```

---

## Task 11 (Agent D): Document Admin Module and Mocks

**Files:**
- Modify: `frontend/src/admin/AdminPage.tsx`
- Modify: `frontend/src/admin/EndOfDayPage.tsx`
- Modify: `frontend/src/admin/EventSetup.tsx`
- Modify: `frontend/src/admin/ReportsPage.tsx`
- Modify: `frontend/src/admin/UserManagement.tsx`
- Modify: `frontend/src/admin/AdminPage.test.tsx`
- Modify: `frontend/src/admin/EndOfDayPage.test.tsx`
- Modify: `frontend/src/admin/EventSetup.test.tsx`
- Modify: `frontend/src/admin/ReportsPage.test.tsx`
- Modify: `frontend/src/admin/UserManagement.test.tsx`
- Modify: `frontend/src/mocks/handlers.ts`
- Modify: `frontend/src/mocks/server.ts`
- Modify: `frontend/src/mocks/tokens.ts`

Read each file before editing it.

- [ ] **Step 1: Document `EventSetup.tsx`**

Add file-level comment:

```ts
/**
 * Event setup panel — lists all swap events in a table, allows creating new events,
 * and activating an event as the current active session.
 */
```

Document the component and its internal functions:

```ts
/**
 * Admin panel for managing swap events.
 * Fetches all events on mount; provides a Create Event form and per-row Activate buttons.
 */
export function EventSetup()

/** Load (or reload) all events from the API into local state. */
async function load()

/** Handle Create Event form submission — calls createEvent and appends to the list. */
async function handleCreate(e: FormEvent)

/** Activate the selected event and reload the event list. */
async function handleActivate(id: number)
```

- [ ] **Step 2: Document `UserManagement.tsx`**

Add file-level comment:

```ts
/**
 * User management panel — lists all event user accounts, creates new accounts
 * with a role selector, and deactivates existing accounts.
 */
```

Document the component and internal handlers.

- [ ] **Step 3: Document `AdminPage.tsx`**

Read the file, then add:
- File-level comment: `"Admin landing page — navigation hub displaying section cards for Event Setup, User Management, Reports, and database Backup."`
- Component comment: summary line

- [ ] **Step 4: Document `EndOfDayPage.tsx`**

Add file-level comment:

```ts
/**
 * End-of-day report page — fetches the daily summary report for the active event
 * and displays it with CSV, PDF, and Markdown download buttons.
 */
```

Document the component and any internal handlers for the download buttons.

- [ ] **Step 5: Document `ReportsPage.tsx`**

Add file-level comment:

```ts
/**
 * Reports page — provides seller payout lookup (by seller code or name search),
 * event revenue summary, donations report, and unsold inventory report,
 * each with format download buttons (CSV, PDF, Markdown).
 */
```

Document the component and its internal state/handlers.

- [ ] **Step 6: Document all 5 admin test files**

For each test file, read it first, then add:
1. A file-level `/** */` block describing what is tested and the key scenarios covered.
2. A `/** */` comment above each `describe()` block.
3. A `/** */` comment above each `it()` / `test()` call.

Example for `EventSetup.test.tsx`:

```tsx
/**
 * Tests for EventSetup — covers event list rendering on mount, Create Event form
 * submission (success and validation), and Activate button behavior.
 */

describe('EventSetup', () => {
  /** Renders the events table with names, years, and status on mount. */
  it('renders event list', async () => { ... })

  describe('Create Event form', () => {
    /** Submitting the form calls createEvent with the entered name, year, and commission. */
    it('creates a new event on form submit', async () => { ... })
    /** Newly created event appears in the table after successful creation. */
    it('adds the new event to the table', async () => { ... })
  })

  describe('Activate button', () => {
    /** Clicking Activate calls activateEvent with the correct event ID. */
    it('activates the selected event', async () => { ... })
  })
})
```

Apply the same three-level pattern to `AdminPage.test.tsx`, `EndOfDayPage.test.tsx`, `ReportsPage.test.tsx`, and `UserManagement.test.tsx`.

- [ ] **Step 7: Document `src/mocks/tokens.ts`**

Read the file first. Add a file-level comment and a `/** */` comment above each exported token constant (keep the token string values unchanged):

```ts
/**
 * Pre-signed JWT tokens for Vitest tests.
 * Each encodes a different role scoped to event 1.
 * Do NOT use these tokens in any non-test context.
 */

/** JWT encoding admin role for event 1. Use in tests requiring full admin access. */
export const ADMIN_TOKEN = '...'  // keep existing value

/** JWT encoding intake role for event 1. Use in tests requiring intake-only access. */
export const INTAKE_TOKEN = '...'  // keep existing value

/** JWT encoding cashier role for event 1. Use in tests requiring cashier-only access. */
export const CASHIER_TOKEN = '...'  // keep existing value
```

- [ ] **Step 8: Document `src/mocks/server.ts`**

Read the file first. Add a file-level comment:

```ts
/**
 * MSW (Mock Service Worker) Node server for Vitest tests.
 * Configured with all API route handlers from {@link handlers}.
 * Lifecycle managed by test-setup.ts: started before all tests,
 * reset between test files, and closed after all tests.
 */
```

- [ ] **Step 9: Document `src/mocks/handlers.ts`**

Read the file first. Add a file-level comment plus a one-line `/** */` comment above each `http.*` handler call describing which route it mocks and what it returns. Group comments mirror the existing inline `// Auth`, `// Events`, etc. section comments:

```ts
/**
 * MSW request handlers for all 32 backend API routes.
 * Used in Vitest tests to intercept fetch calls and return deterministic fixture data.
 * All handlers return HTTP 200 with representative fixture objects, except:
 * - DELETE /items/:id → 204 No Content
 * - POST /admin/backup → application/zip blob
 */

// Fixture objects shared across handlers
/** Fixture Seller — Jane Doe, code A001, event 1. */
const SELLER = { ... }

/** Fixture Item — Skis, code A001-001, price $50, status available. */
const ITEM = { ... }

/** Fixture Intake — seller 1, event 1, no donations. */
const INTAKE = { ... }

/** Fixture Sale — $50 cash, not voided, one line item. */
const SALE = { ... }

export const handlers = [
  // Auth
  /** POST /auth/login → returns ADMIN_TOKEN with admin role for event 1. */
  http.post('/auth/login', ...),

  // Events
  /** GET /events → returns two fixture events (inactive 2025, active 2026). */
  http.get('/events', ...),
  /** POST /events → returns a new fixture event (id 3, year 2027). */
  http.post('/events', ...),
  /** POST /events/:id/activate → returns the fixture event with is_active: true. */
  http.post('/events/:id/activate', ...),

  // Users
  /** GET /users → returns an empty array. */
  http.get('/users', ...),
  /** POST /users → returns a fixture intake-role user. */
  http.post('/users', ...),
  /** PATCH /users/:id/deactivate → returns the fixture user with is_active: false. */
  http.patch('/users/:id/deactivate', ...),

  // Sellers (specific routes before /:id to avoid route shadowing)
  /** GET /sellers → returns an empty array. */
  http.get('/sellers', ...),
  /** POST /sellers → returns the fixture SELLER. */
  http.post('/sellers', ...),
  /** GET /sellers/:id/intakes → returns an array with the fixture INTAKE. */
  http.get('/sellers/:id/intakes', ...),
  /** GET /sellers/:id → returns the fixture SELLER. */
  http.get('/sellers/:id', ...),
  /** PATCH /sellers/:id → returns the fixture SELLER. */
  http.patch('/sellers/:id', ...),

  // Intakes
  /** POST /intakes → returns the fixture INTAKE. */
  http.post('/intakes', ...),
  /** GET /intakes/:id → returns the fixture INTAKE with an empty items array. */
  http.get('/intakes/:id', ...),
  /** PATCH /intakes/:id → returns the fixture INTAKE. */
  http.patch('/intakes/:id', ...),
  /** POST /intakes/:id/items → returns the fixture ITEM. */
  http.post('/intakes/:id/items', ...),
  /** POST /intakes/:id/labels → returns { intake_id: 1, printed: 5 }. */
  http.post('/intakes/:id/labels', ...),

  // Items (specific routes before /:id to avoid route shadowing)
  /** GET /items/lookup → returns the fixture ITEM extended with seller_code: 'A001'. */
  http.get('/items/lookup', ...),
  /** GET /items/search → returns an empty array. */
  http.get('/items/search', ...),
  /** GET /items/:id → returns the fixture ITEM. */
  http.get('/items/:id', ...),
  /** PATCH /items/:id → returns the fixture ITEM. */
  http.patch('/items/:id', ...),
  /** DELETE /items/:id → returns 204 No Content. */
  http.delete('/items/:id', ...),
  /** POST /items/:id/label → returns the fixture ITEM. */
  http.post('/items/:id/label', ...),

  // Sales
  /** POST /sales → returns the fixture SALE. */
  http.post('/sales', ...),
  /** GET /sales/:id → returns the fixture SALE. */
  http.get('/sales/:id', ...),
  /** POST /sales/:id/void → returns the fixture SALE with is_voided: true. */
  http.post('/sales/:id/void', ...),

  // Reports
  /** GET /reports/:eventId/seller/:sellerId → returns a fixture SellerPayoutReport for seller A001. */
  http.get('/reports/:eventId/seller/:sellerId', ...),
  /** GET /reports/:eventId/revenue → returns a fixture EventRevenueReport. */
  http.get('/reports/:eventId/revenue', ...),
  /** GET /reports/:eventId/donations → returns a fixture DonationsReport with one item. */
  http.get('/reports/:eventId/donations', ...),
  /** GET /reports/:eventId/unsold → returns a fixture UnsoldItemsReport with one item. */
  http.get('/reports/:eventId/unsold', ...),
  /** GET /reports/:eventId/end-of-day → returns a fixture EndOfDayReport. */
  http.get('/reports/:eventId/end-of-day', ...),

  // Admin
  /** POST /admin/backup → returns a zip blob with HTTP 200. */
  http.post('/admin/backup', ...),
]
```

Keep all existing handler implementations unchanged — only insert the `/** */` comments.

- [ ] **Step 10: Verify**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass

- [ ] **Step 11: Commit**

```bash
git add frontend/src/admin/ frontend/src/mocks/
git commit -m "docs: add TSDoc to admin module and mocks"
```

---

## Task 12: Final verification and PR

**Files:** none

- [ ] **Step 1: Confirm all Phase 2 commits are present on the branch**

```bash
git log --oneline docs/frontend-tsdoc
```

Expected: 12+ commits including all Phase 1 and Phase 2 tasks

- [ ] **Step 2: Run the full test suite one final time**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass. If any test fails, read the failing test file and check whether a TSDoc comment accidentally modified logic (e.g., a `/** */` block placed inside a function body instead of above it). Fix and recommit before opening the PR.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin docs/frontend-tsdoc
gh pr create \
  --title "docs: add TSDoc inline documentation to all 54 frontend files" \
  --body "$(cat <<'EOF'
Adds TSDoc-style /** */ comments to all 54 frontend source and test files.

## What changed
- `src/types.ts` — all 29 interfaces; every field documented with business-rule explanations
- `src/api/` (9 files) — @param/@returns/@throws on every exported function and class
- `src/auth/`, `src/components/`, `src/App.tsx`, `src/main.tsx`, `src/test-setup.ts` — file-level comments, component summaries, hook docs
- `src/intake/`, `src/pos/`, `src/admin/` — all source components with prop documentation
- All test files — file header + describe-block + per-it comments
- `src/mocks/` — handler route comments, server lifecycle comment, token role comments

## What did NOT change
No logic, imports, function signatures, component behaviour, props interfaces, or test assertions were modified. TSDoc comments are additive only.

## Verification
Full Vitest suite passes on the branch before this PR was opened.
EOF
)"
```
