# Demo Feedback — Design Specification

**Date:** 2026-04-11  
**Source:** Post-demo feedback (7 items)  
**Status:** Approved

---

## Overview

Seven improvements identified after a live demo. Items 1 & 5 collapsed into a single Seller Management feature. Items 2 & 7 collapsed into an improved per-seller report UI.

---

## 1. Auto-generated IDs (Seller Codes & Item Codes)

### Seller codes

- On `POST /sellers`, the backend auto-assigns the next sequential 3-digit zero-padded code for the active event (001, 002, 003…).
- The `code` field is removed from `SellerCreate`. The backend queries `MAX(code)` for sellers in the active event, increments, and assigns.
- `SellerResponse` continues to return `code`; it is displayed to staff after registration.
- The `SellerForm` frontend removes the code input field entirely.

### Item codes

- On `POST /intakes/{intake_id}/items`, the backend auto-generates the item code as `{seller_code}-{nn}` where `nn` is the next 2-digit zero-padded sequence for that seller's items across all their intakes in the event (e.g., `001-01`, `001-02`).
- The `code` field is removed from `ItemCreate`. The backend queries `MAX(code)` for items belonging to that seller in the active event, parses the sequence suffix, increments, and assigns.
- `ItemResponse` continues to return `code`; it is displayed in the item list after creation.
- The `ItemForm` frontend removes the code input field.

### Migration

No schema migration needed — `code` columns already exist and remain `NOT NULL`. The change is behavioral: the server assigns the value instead of the client.

---

## 2. Seller Management (Admin) — Items 1 & 5

### New "Sellers" tab

Added to `AdminPage` alongside the existing Events, Users, EOD, and Reports tabs.

### Sellers list page (`SellerListPage`)

- **Search bar** — labelled "Search by name or code", calls `GET /sellers?q=` (already implemented on the backend). Debounced 300 ms.
- **Table columns** — Code | Full Name | Phone | Email | View
- **"Register New Seller" button** — opens `SellerForm` inline (or navigates to a create form).
- Roles: admin and intake (`_INTAKE_ADMIN` guard, same as the existing sellers API).

### Seller detail page (`SellerDetailPage`)

Reached by clicking "View" on any row. The Sellers tab manages a `selectedSellerId` state variable — when set, it renders `SellerDetailPage` in place of the list. No new URL routes are needed; this matches the tab-based navigation pattern used throughout `AdminPage`.

**Contact card:**
- Displays: code, full name, company, phone, email, address/city/state/zip.
- **Edit** button opens an inline edit form (`SellerUpdate` fields) and saves via `PATCH /sellers/{id}`.

**Items table:**
- Columns: Code | Description | Category | Price | Status | Edit | Delete
- Inline edit opens `ItemForm` pre-populated with the item's current values.
- Delete calls `DELETE /items/{id}` (existing endpoint — only allows deletion before label printed).
- **"+ Add Item"** button opens `ItemForm` for a new item in the seller's most recent intake session (by ID), or creates a new intake session automatically if none exists.
- **"Import from Excel"** button — see Section 5.
- **"Download Template"** link — `GET /items/import-template`.

**Back navigation:** breadcrumb link returns to the Sellers list.

---

## 3. Intake — Postal Address — Item 4

The `Seller` model already has `address`, `city`, `state`, `zip` columns. This is a frontend-only change.

**`SellerForm` additions:**
- Remove the `code` input (auto-generated, Section 1).
- Add optional fields: Street Address, City, State (2-letter), ZIP.
- Grouped visually under an "Address (optional)" section.

**`ItemForm` change:**
- Remove the `code` input (auto-generated, Section 1).
- All other fields unchanged.

---

## 4. Checkout Search Across All Fields — Item 3

**Backend — `GET /items/search`:**

Extend the `ilike` filter in `search_items` from code-only to match any of:
- `item.code`
- `item.description`
- `item.category`
- `item.brand`
- `seller.code` (already joined)

```python
# Before
.filter(Item.code.ilike(f"%{q}%"), Seller.event_id == event.id)

# After
.filter(
    (Item.code.ilike(f"%{q}%"))
    | (Item.description.ilike(f"%{q}%"))
    | (Item.category.ilike(f"%{q}%"))
    | (Item.brand.ilike(f"%{q}%"))
    | (Seller.code.ilike(f"%{q}%")),
    Seller.event_id == event.id,
)
```

No frontend or schema changes needed. The `LookupField` dropdown already shows description, category, and seller code.

---

## 5. Excel Import — Item 6

### Template

`GET /items/import-template` returns a downloadable `.xlsx` file with a single header row:

| Description | Category | Brand | Type | Color | Size | Gender/Age | Year | Price | Used | Donate if Unsold |
|---|---|---|---|---|---|---|---|---|---|---|

- `Price` — numeric (dollars).
- `Used` — `Yes` / `No` (defaults to `Yes` if blank).
- `Donate if Unsold` — `Yes` / `No` (defaults to `No` if blank).
- `Year` — integer, optional.
- Seller code and item code are omitted — both are auto-generated on import.

### Import endpoint

`POST /intakes/{intake_id}/items/import` — accepts `multipart/form-data` with a single `file` field.

**Processing:**
1. Parse with `openpyxl`. Skip header row.
2. For each data row: validate required fields (`Description`, `Price`). Skip and record invalid rows.
3. Auto-generate item code (same algorithm as single-item creation — continue sequence from seller's existing items).
4. Bulk-insert valid items.
5. Return `ImportResult`: `{ imported: int, skipped: int, errors: [{ row: int, reason: str }] }`.

**Behaviour:** Partial success — valid rows are committed even if some rows fail. No all-or-nothing rollback.

**Role guard:** `_INTAKE_ADMIN` (admin or intake).

### Frontend

On the Seller detail page (Section 2):
- **"Download Template"** — anchor link to `GET /items/import-template`.
- **"Import from Excel"** — file input (`.xlsx` only). On selection, POSTs to the intake import endpoint and shows the `ImportResult` summary (imported count, any skipped rows with reasons). Item list refreshes after a successful import.

The intake session used for import is the seller's most recent intake (by ID — `Intake` has no open/closed status), or a new one is created automatically if none exists.

---

## 6. Reports — Seller Payout Search — Items 2 & 7

### Seller selector (replaces numeric ID input)

The current `<input type="number">` Seller ID field in `ReportsPage` is replaced with a searchable combobox:
- Text input calls `GET /sellers?q=` with 300 ms debounce.
- Dropdown shows matching sellers as `{code} — {first_name} {last_name}`.
- Selecting a seller stores their `id` internally; "Get Payout" fires `GET /reports/{event_id}/seller/{seller_id}`.
- The combobox can be extracted as a `SellerCombobox` component reusable elsewhere.

### Payout display

Below the existing summary numbers, add a **line items table**:

| Item Code | Description | Status | Ask Price | Sold Price |
|---|---|---|---|---|

Data comes from the existing `line_items` array in `SellerPayoutReport` — no backend changes needed.

---

## Affected Files

### Backend
| File | Change |
|---|---|
| `app/schemas/seller.py` | Remove `code` from `SellerCreate` |
| `app/schemas/item.py` | Remove `code` from `ItemCreate` |
| `app/routers/sellers.py` | Auto-assign seller code on create |
| `app/routers/items.py` | Auto-assign item code on create; extend search filter; add import endpoint |
| `app/routers/intakes.py` | (minor) used by import flow |
| `backend/requirements.txt` | Add `openpyxl` |

### Frontend
| File | Change |
|---|---|
| `src/intake/SellerForm.tsx` | Remove code field; add address fields |
| `src/intake/ItemForm.tsx` | Remove code field |
| `src/admin/AdminPage.tsx` | Add Sellers tab |
| `src/admin/SellerListPage.tsx` | New component |
| `src/admin/SellerDetailPage.tsx` | New component |
| `src/admin/ReportsPage.tsx` | Replace ID input with SellerCombobox; add line items table |
| `src/components/SellerCombobox.tsx` | New shared component |
| `src/api/sellers.ts` | (minor) ensure search endpoint wired |
| `src/api/items.ts` | Add import and template download calls |
| `src/types.ts` | Add `ImportResult` type |

### Tests
- Backend: extend `test_sellers.py`, `test_items.py` for auto-code generation and import endpoint
- Frontend: new test files for `SellerListPage`, `SellerDetailPage`, `SellerCombobox`; update `SellerForm`, `ItemForm`, `ReportsPage` tests

---

## Out of Scope

- Bulk "all sellers" CSV export (not requested)
- Seller merge / duplicate detection
- Import from non-template Excel formats
