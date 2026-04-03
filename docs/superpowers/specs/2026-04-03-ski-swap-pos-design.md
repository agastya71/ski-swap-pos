# MYSL Ski Swap POS — Design Specification

**Date:** 2026-04-03  
**Organization:** Minnesota Youth Ski League (MYSL)  
**Project:** Point of Sale system for the annual ski equipment swap

---

## 1. Overview

MYSL holds an annual ski equipment swap where individual consignors and retail vendors bring used and new equipment to sell. The POS system manages the full event lifecycle: pre-event seller and item registration, day-of intake and label printing, sale-day checkout across multiple stations, and end-of-day payout reporting.

The system replaces an existing 4D database application (SwapSoft). The data model is derived from the SwapSoft schema with targeted refinements.

---

## 2. Event Lifecycle

The swap runs across three phases:

### Phase 1 — Pre-Event (days/weeks before)
Staff enter seller registrations and item lists in advance using the Intake module. Labels are pre-printed and attached to items before they arrive on swap day.

### Phase 2 — Intake / Drop-Off
Sellers arrive and drop off pre-tagged items. Staff verify items against the system, make corrections, print any missing labels, and confirm donation preferences.

### Phase 3 — Sale Day
Doors open to buyers. 4–5 POS checkout stations run simultaneously. At end of day, admin marks unsold items as donated or returned and generates seller payout reports.

---

## 3. Architecture

### Deployment Model
A **local network web application**. One dedicated laptop runs the server; all other stations connect via browser over local WiFi. No internet connection required on event day.

### Components

| Component | Technology |
|-----------|------------|
| Backend API | Python 3.11+ + FastAPI |
| Database | SQLite (single `.db` file per event year) |
| Frontend | React (TypeScript) + Vite, compiled to static files served by FastAPI |
| ORM / Migrations | SQLAlchemy + Alembic |
| Label Printing | ZPL generation (server-side) sent to USB label printer on server laptop |
| Credit Card | Square Web Payments SDK (browser-side) + Square API (server-side recording) |

### Network Layout

```
SERVER LAPTOP (localhost:8000)
├── FastAPI backend (REST API)
├── React UI (served as static build)
├── SQLite DB  →  swap_YYYY.db
├── USB Label Printer  →  item tags at intake
└── Square Reader (USB)  →  card payments at this station

LOCAL WIFI (192.168.x.x:8000)
├── POS Station 1  →  browser + barcode scanner + Square reader
├── POS Station 2  →  browser + barcode scanner + Square reader
├── POS Station 3  →  browser + barcode scanner + Square reader
└── POS Station 4  →  browser + barcode scanner + Square reader
```

**Startup:** A volunteer runs `start.sh` on the server laptop, opens a browser to `localhost:8000`, and shares the LAN IP with other stations. Setup takes under 2 minutes.

---

## 4. Data Model

Seven tables. All data is scoped to an event year via `event_id`.

### `event`
Stores per-event configuration. Only one event is active at a time.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| name | text | e.g. "MYSL Swap 2026" |
| year | integer | |
| commission_rate | real | Configurable via Admin UI (e.g. 0.30 = 30%) |
| is_active | boolean | Only one active event at a time |
| created_at | datetime | |

### `user`
Per-event logins with role-based access. Created by admin on or before event day.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| event_id | FK → event | |
| username | text | |
| password_hash | text | bcrypt |
| role | text | `admin` / `intake` / `cashier` |
| is_active | boolean | |

### `seller`
Individual consignors and retail vendors.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| event_id | FK → event | |
| code | text | Short lookup code (unique per event) |
| first_name / last_name | text | |
| company | text | For retail vendors |
| is_vendor | boolean | Retailer flag |
| email | text | |
| phone | text | |
| address / city / state / zip | text | |
| created_at / updated_at / created_by | | Audit fields |

### `intake`
A batch of items registered for a seller in a single session.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| seller_id | FK → seller | |
| date_entered | date | |
| date_received | date | Physical drop-off date |
| donate_unsold | boolean | Donate all unsold items from this batch |
| donate_proceeds | boolean | Donate sale proceeds to MYSL (100% commission) |
| total / mysl_total / seller_total | real | Computed totals for this intake |
| created_at / updated_at / created_by | | Audit fields |

### `item`
Individual equipment items. Each item belongs to one intake batch.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| intake_id | FK → intake | |
| seller_id | FK → seller | Denormalized for query convenience |
| code | text | Unique item code (used for barcode + manual lookup) |
| category / brand / type | text | Equipment classification |
| description | text | |
| color / size / uom | text | |
| gender_age | text | e.g. Adult/Child/Unisex |
| year | integer | Model year |
| used | boolean | New vs. used condition |
| price | real | Asking price |
| quantity | real | For vendor items sold in multiples |
| barcode_39 | text | Code 39 barcode string for label |
| label_line_2 / label_line_3 | text | Additional label display lines |
| donate_unsold | boolean | Per-item override of intake donation flag |
| status | text | `available` / `sold` / `donated` / `returned` |
| vendor_item_id | text | External vendor SKU/reference |
| created_at / updated_at / created_by | | Audit fields |

### `sale`
A completed buyer transaction. One sale can contain items from multiple sellers.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| event_id | FK → event | For direct report scoping |
| date_of_sale | date | |
| customer_name / customer_email | text | Optional buyer info |
| sale_total | real | Sum of all line items |
| mysl_total / seller_total | real | Commission split totals across all items |
| cash_amount / check_amount / cc_amount | real | Payment breakdown |
| check_number | text | |
| total_paid / balance_due | real | |
| notes | text | |
| created_at / updated_at / created_by | | Audit fields |

### `sale_item`
Line items linking items to a sale.

| Field | Type | Notes |
|-------|------|-------|
| id | integer PK | |
| sale_id | FK → sale | |
| item_id | FK → item | |
| line_number | integer | Display order |
| quantity / sell_price / extended_price | real | |
| notes | text | e.g. price override reason |
| created_at / updated_at / created_by | | Audit fields |

### Key Relationships
- `event` → `seller` → `intake` → `item` (one-to-many chain)
- `sale` ↔ `item` via `sale_item` (many-to-many)
- Each `item` appears on at most one `sale`

---

## 5. User Roles

| Role | Access |
|------|--------|
| **Admin** | Full access: event config, user management, all intake and POS functions, all reports |
| **Intake** | Seller registration, item entry, label printing. Can view but not modify sales. |
| **Cashier** | POS checkout and payment only. No access to intake, seller data, or reports. |

Logins are created per-event by an admin. Users log in with username + password; the session is role-scoped.

---

## 6. Application Modules

### 6.1 Admin Module

**Event Setup**
- Create a new event with name, year, and commission rate
- Activate an event (only one active at a time)
- Manage user logins and roles for the event

**Reports** (end of day / any time)
- Seller payout summary — total sold, MYSL cut, seller payout, per seller
- Event revenue totals — gross sales, MYSL total, seller total, donations
- Donation totals — items donated, proceeds donated
- Unsold items list — by seller, with donate/return status

**End of Day**
- Bulk-mark unsold items as donated or returned
- Export payout report (CSV and PDF)
- One-click database file backup/download

### 6.2 Intake Module

**Seller Management**
- Search existing sellers by name or code
- Register a new seller (individual or vendor)
- Set intake-level donation preferences (donate unsold items / donate proceeds)

**Item Entry**
- Create an intake batch for a seller
- Add items with: category, brand, type, description, color, size, gender/age, year, condition, price, quantity
- Per-item donation flag (overrides intake-level preference)
- Edit or remove items before labels are printed

**Label Printing**
- Print a single item label
- Print all labels for an intake batch
- Labels include: item code (Code 39 barcode), seller code, price, description, label lines 2 & 3

### 6.3 Cashier (POS) Module

**Checkout**
1. Item lookup field always active — cashier scans barcode or types item code directly (both are first-class inputs)
2. Lookup validates item exists and status is `available`; inline error shown if not found or already sold
3. Item added to cart; cashier can continue scanning additional items
4. Cart shows: seller code, description, price per item, running total
5. Cashier can adjust quantity, apply a price override (reason required), or remove items

**Payment**
- Cash, check (check number required), credit card (Square), or any split combination
- Square Web Payments SDK handles card capture in-browser; FastAPI records result after Square confirms
- If Square fails, cashier can retry or switch to cash/check

**Sale Completion**
- Backend commits atomically: creates `sale`, creates `sale_item` rows, marks each `item.status = sold`, calculates commission split
- Confirmation screen shows sale total and items sold
- Cashier clicks **"New Transaction"** to immediately clear and begin the next customer — no auto-timeout

**Void / Cancel**
- Cashier can cancel an in-progress transaction (before confirmation) without any record written
- Completed sales can be voided by admin only (restores item status to `available`)

---

## 7. Business Rules

### Commission Calculation
Applied per item at time of sale:

```
if intake.donate_proceeds:
    mysl_share   = item.price   # 100% to MYSL
    seller_share = 0
else:
    mysl_share   = item.price × event.commission_rate
    seller_share = item.price − mysl_share
```

The `commission_rate` is set per event in the Admin UI and applies uniformly to all sellers (individual consignors and retail vendors alike).

### Donation Rules
- **Donate proceeds** (`intake.donate_proceeds = true`): MYSL keeps 100% of sale price for all items in the intake. Seller receives $0 payout. This flag is set at the intake level only.
- **Donate unsold** (`donate_unsold = true`): Unsold items at end of day are marked `status = donated` rather than returned to the seller. This flag is set at the intake level and can be overridden per individual item.

### Item Status Lifecycle
```
available → sold       (at checkout)
available → donated    (end-of-day, if donate_unsold)
available → returned   (end-of-day, if not donated)
sold      → available  (admin void only)
```

---

## 8. Hardware Integration

### Barcode Scanner (USB/Bluetooth)
Operates as a keyboard input device — no driver or API integration needed. Scanner fires the barcode string into the active item lookup field in the browser. The app keeps the lookup field focused during checkout.

### Label Printer (USB, server laptop only)
- Server generates ZPL (Zebra Printer Language) label content
- Raw ZPL is sent directly to the USB label printer via socket or `lpr` — bypasses the OS print dialog entirely
- Label content: Code 39 barcode of item code, seller code, price, description, label lines 2 & 3
- Browser sends a print request to the FastAPI backend, which generates ZPL and dispatches it to the printer

### Square Credit Card Reader (USB, each POS station)
- Square Web Payments SDK runs in the browser at each POS station
- Card capture (tap/swipe/chip) handled locally by Square hardware + SDK
- FastAPI backend receives the Square payment token after capture, records the transaction amount against the sale
- Square handles PCI compliance; no card data touches the application database

---

## 9. Reporting

All reports are scoped to the active event and generated on demand.

| Report | Contents | Format |
|--------|----------|--------|
| Seller Payout Summary | Per seller: items sold, gross, MYSL cut, seller payout | Screen + CSV + PDF |
| Event Revenue | Gross sales, MYSL total, seller total, breakdown by payment type | Screen |
| Donation Totals | Proceeds donated (by seller), items donated (count + value) | Screen |
| Unsold Items | Per seller: item code, description, price, final status | Screen + CSV |

---

## 10. Error Handling & Resilience

- **Duplicate scan**: If a cashier scans an already-sold item, an inline error appears immediately on the lookup field. The cart is not affected.
- **Square failure**: Cashier is prompted to retry or switch payment method. No sale record is written until payment is confirmed.
- **Network drop at POS station**: The POS station loses connectivity to the server; it shows a clear "connection lost" banner. In-progress carts are lost — the cashier must re-enter items once connectivity restores. (Full offline mode is out of scope for v1.)
- **Sale atomicity**: The backend wraps sale creation, sale_item insertion, and item status updates in a single SQLite transaction. Partial failures roll back completely.
- **Database backup**: Admin can download the `.db` file at any time from the Admin UI. Recommended before and after event day.

---

## 11. Tech Stack Summary

| Layer | Choice |
|-------|--------|
| Backend language | Python 3.11+ |
| Web framework | FastAPI |
| Database | SQLite via SQLAlchemy + Alembic |
| Frontend framework | React 18 + TypeScript |
| Frontend build | Vite |
| Auth | JWT tokens (short-lived, role-scoped) |
| Password hashing | bcrypt |
| Label printing | ZPL generation + system print |
| Card payments | Square Web Payments SDK + Square Payments API |
| Testing | pytest (backend), Vitest + React Testing Library (frontend) |
| Packaging | Shell script (`start.sh`) to install deps and launch server |

---

## 12. Testing Approach

- **Backend**: pytest unit tests for business logic (commission calc, donation rules, item status transitions) and integration tests for API endpoints using a test SQLite database
- **Frontend**: Vitest + React Testing Library for component logic; focus on checkout flow and form validation
- **Manual**: End-to-end test run before each event covering full lifecycle — seller registration → item entry → label print → checkout → report generation
- **No mocking of the database**: Integration tests hit a real (test) SQLite file to catch schema/query issues

---

## 13. Out of Scope (v1)

- Public-facing seller pre-registration portal
- Online/cloud deployment
- Offline POS station mode (full local cart persistence without server)
- Non-profit accounting and compliance reports (to be defined with MYSL stakeholders)
- Historical data migration from SwapSoft (4D database)
- Email receipts to buyers
