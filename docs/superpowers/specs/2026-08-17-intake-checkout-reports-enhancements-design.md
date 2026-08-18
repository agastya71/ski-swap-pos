# Intake, Checkout & Reports Enhancements — Design Specification

**Date:** 2026-08-17
**Status:** Draft (pending category→type mapping from stakeholders)
**Supersedes / amends:**
- `2026-04-03-ski-swap-pos-design.md` (seller validation, data model, POS module, reports)
- `2026-04-03-phase-4-checkout-api-design.md` (quantity model, single-page checkout, payment ids)
- `2026-04-03-phase-5-reports-api-design.md` (per-item commission/payout/rate in seller payout)
- `2026-04-11-intake-sellers-size-dropdowns-design.md` (category→type cascade; size still keyed by type)
- `2026-04-12-download-template-top-level-design.md` (import formats + error report)

---

## 1. Overview

A bundled set of enhancements driven by event-day feedback, grouped into three areas:

1. **Seller & item intake** — stronger seller registration validation, bulk import with error reporting, category-driven type selection, brand matching, donation-default inheritance, soft delete, and a full quantity model for items.
2. **Checkout** — single-page checkout (cart + payment + confirmation on one screen), partial-quantity sales, payment-transaction ids, and post-sale price correction.
3. **Reports** — per-item commission, payout, and rate in the seller payout report.

Each section below states the requirement, the decision, and the concrete schema/API/UI changes.

---

## 2. Seller Registration Validation

### Requirements (from stakeholder)
- First + Last name mandatory **or** Company if a vendor.
- Phone **or** Email — one of the two must be provided.
- Address, City, State, Zip mandatory; State is a 2-character dropdown.
- A vendor (`is_vendor=True`) is never a person: company required, first/last not required.

### Decisions
- `is_vendor=True` → `company` required; `first_name` / `last_name` optional (may be empty).
- `is_vendor=False` → `first_name` + `last_name` required; `company` optional.
- At least one of `email` / `phone` required.
- `email`: RFC-style format validation (Pydantic `EmailStr` or equivalent regex).
- `phone`: strip non-digits; must be exactly **10 digits** (US/Canada). Stored normalized as 10-digit string.
- `address`, `city`, `state`, `zip` all required.
- `state`: hardcoded **US states + DC** 2-character dropdown in the frontend (e.g. `frontend/src/lib/usStates.ts`). Backend accepts any 2-char string but frontend constrains to the list.
- `zip`: US 5-digit validation, regex `^\d{5}$`.

### Schema changes — `backend/app/schemas/seller.py`
Move name requirement out of the DB constraint and into Pydantic validators:

- `first_name`, `last_name` become `Optional[str] = None` on `SellerCreate` / `SellerUpdate`.
- Add a **model validator**: if `is_vendor` is False, `first_name` and `last_name` must be non-empty; if True, `company` must be non-empty. Violations → 422 with a clear message.
- Add a validator: at least one of `email` / `phone` non-empty.
- `email`: `Optional[EmailStr]`.
- `phone`: `Optional[str]` with a field validator that strips non-digits and enforces `len == 10` when present.
- `state`: `Optional[str]` with `min_length=2, max_length=2`; frontend dropdown is the source of the allowed set.
- `zip`: `Optional[str]` with regex `^\d{5}$` when present.
- `address`, `city`: required non-empty strings.

### Model / migration changes — `backend/app/models/seller.py`
- `first_name` and `last_name` change from `nullable=False` to `nullable=True` (so vendors can omit them).
- Migration `..._relax_seller_name_nullable.py`: `batch_alter_table` to drop NOT NULL on `seller.first_name` and `seller.last_name`. Existing rows unaffected.

### Frontend — `frontend/src/intake/SellerForm.tsx`
- Conditional required markers: when `is_vendor` unchecked → first/last required, company hidden-or-optional; when checked → company required, first/last optional.
- State field → `<select>` populated from `US_STATES` (`{ code, name }[]`).
- Zip field → `pattern="\d{5}"` `maxLength={5}`; phone field → display + normalize to 10 digits on blur.
- Inline validation messages mirroring backend 422s.

### New file — `frontend/src/lib/usStates.ts`
Exports `US_STATES: { code: string; name: string }[]` (50 states + DC).

### Tests
- `backend/tests/test_sellers.py`: vendor with company only → 201; individual missing last name → 422; individual missing both phone and email → 422; bad email → 422; phone with 9 digits → 422; phone with formatting `(612) 555-1234` → normalized to `6125551234` and 201; zip `1234` → 422.
- `frontend/src/intake/SellerForm.test.tsx`: state field renders as `<select>` with 51 options; required fields toggle with `is_vendor`.

---

## 3. Bulk Import of Filled-Out Template

### Requirements
- Import available from **both** the user (individual consignor) and vendor intake forms.
- Template is the existing Intake-tab download (`GET /items/import-template`).
- Import applies to **already-registered sellers** (attaches items to a seller code); seller registration is **not** done through the template.
- Supported formats: Excel (`.xlsx`), CSV, TSV.
- Process all records; collect **all** errors; errors are downloadable as an error report.

### Decisions
- Reuse the existing template; no schema change to the template itself beyond any new columns introduced by this spec (quantity, brand-matching, category/type).
- Import is initiated from the seller's item screen (where "Import from Excel" already lives in `SellerDetailPage`) **and** mirrored on the vendor path. Both call the same endpoint.
- Backend endpoint: `POST /items/import` (multipart `file` + `seller_id` form field). Accept `.xlsx`, `.csv`, `.tsv`, detected by extension and/or content.
- **All-or-error-report semantics:** every row is validated; the transaction commits **only the valid rows** and returns a structured result: `{ imported: int, errors: ImportError[] }`. The caller can download the errors as a CSV/Excel error report (`POST /items/import` response includes an `errors` array; a separate `GET` or inline download renders the error report). Invalid rows are **not** written.
  - Rationale: stakeholder wants all errors identified in one pass and downloadable, without losing the valid rows.
- **Brand matching on import:** for each row's brand value, run a closest-match against existing brand strings in the event (case-insensitive, normalized). If a close match exists (above a chosen similarity threshold), replace with the matched brand. If no close match, keep the entered value as-is. (See §5 for the matching approach.)
- Rows missing required fields, with invalid category/type/size, or referencing a sold/deleted item state are reported as errors, not written.
- Error report columns: row number, field(s) in error, error message, original value.

### API — `backend/app/routers/items.py`
- `POST /items/import` — roles `admin | intake`. Multipart: `file`, `seller_id`. Returns `ImportResultResponse`.
- `ImportResultResponse`: `{ imported: int, errors: list[ImportErrorRow], download_url: str|null }`. `download_url` present when `errors` non-empty (error report as CSV).
- Errors do **not** raise 422 for the whole request unless the file itself is unparseable (wrong format, encoding) → 422.

### Service — `backend/app/services/item_import.py` (new)
- Parse by extension: `openpyxl` for `.xlsx`, stdlib `csv` for `.csv`/`.tsv` (delimiter sniffed).
- Validate each row against the same rules used by `POST /items` (category/type/size, brand required, price > 0, quantity ≥ 1).
- Apply brand closest-match (§5).
- Commit valid rows; collect errors for invalid rows.
- Atomic per valid-row insert within a single transaction; a row failing to insert rolls back only that row's effect (use savepoints or validate-before-insert so no partial row is written).

### Frontend
- `SellerDetailPage.tsx` — keep existing "Import from Excel" but widen to "Import Items" with accepted formats `.xlsx,.csv,.tsv`.
- Vendor intake path — mirror the same import control on the vendor item entry screen.
- On completion, show a summary: "Imported N rows. M errors." with a "Download error report" link when errors exist.

### Tests
- `backend/tests/test_items_import.py`: valid xlsx → imported count correct; mixed valid/invalid → valid committed, errors returned; unknown format → 422; brand fuzzy-matched to existing; missing seller → 404; non-intake/admin role → 403; error report CSV shape.
- `frontend` import component: file select → posts multipart; renders error count + download link.

---

## 4. Category → Type Cascade (Size still keyed by Type)

### Requirements
- Types are dependent on Category (e.g. Category `Skis` → Types `Skate`, `Classic`).
- Size remains keyed by Type (per the 2026-04-11 spec).

### Decisions
- `category` becomes a **dropdown** (first-level). Selecting a category populates the `type` dropdown with that category's allowed types. Selecting a type populates the `size` dropdown with that type's sizes (unchanged from 2026-04-11).
- Cascade: **Category → Type → Size**.
- `"Other"` remains the fallback at the category and/or type level → free text where no list applies.
- The full **Category → Type** mapping is **pending from stakeholders** (tracked as the single open item in this spec). Until provided, the implementation uses a placeholder config module with the structure below so wiring can proceed; values are filled in when the mapping arrives.

### New config — `frontend/src/lib/equipmentTaxonomy.ts`
```ts
export const CATEGORIES: string[] = [/* TBD by stakeholder */];
export const TYPES_BY_CATEGORY: Record<string, string[]> = { /* TBD */ };
export const SIZE_OPTIONS: Record<string, string[]> = { /* from existing itemSizes.ts */ };
```
The existing `frontend/src/lib/itemSizes.ts` `ITEM_TYPES` flat list is **retired** in favor of `TYPES_BY_CATEGORY`; `SIZE_OPTIONS` is kept as-is.

### `ItemForm.tsx` changes
- `category` → `<select>` from `CATEGORIES`.
- `type` → `<select>` populated from `TYPES_BY_CATEGORY[category]`; blank when category empty or `"Other"`.
- `size` → unchanged logic, keyed by `type`.
- Reset rule: changing `category` resets `type` and `size`; changing `type` resets `size`.

### Backend
- `category`, `type`, `size` remain free-text columns (no schema change).
- Optional: a validation endpoint `GET /equipment/taxonomy` returning the config so import validation can share the source of truth. (If the taxonomy stays frontend-only, import validation re-implements the same lists server-side; preferred: shared source to avoid drift — recommend a small `backend/app/data/equipment_taxonomy.py` mirrored by the frontend config.)

### Tests
- `ItemForm.test.tsx`: selecting category populates type options; changing category resets type+size; "Other" category → type free text.

### Open item
- **[PENDING] Stakeholder to provide full Category → Type mapping.**

---

## 5. Brand — Mandatory with Closest-Match Suggestion

### Requirements
- Brand mandatory (required validation).
- Free text, with close-alternative suggestions while typing.
- On template upload, replace brand with the closest existing match.

### Decisions
- `item.brand` becomes `NOT NULL` at the schema layer via validation (keep the column nullable in the DB to ease migrations; enforce required in `ItemCreate`/`ItemUpdate` and import).
- Frontend: brand input is a text field with an autocomplete/typeahead dropdown listing existing brands in the event whose normalized form is within a similarity threshold of the typed value (e.g. Levenshtein/edit-distance ≤ 2, case-insensitive, whitespace-trimmed). Cashier/intake user can pick a suggestion or keep their typed value.
- Import (server-side): for each row's brand, compute closest match among existing brands using the same normalized edit-distance threshold. If a match is found, **replace** the row's brand with the match. If none, keep the row's brand (still required — empty brand is an error).
- A shared normalize helper `normalize_brand(s)` = `s.strip().lower()` used by both frontend and backend.

### New helper — `frontend/src/lib/brandMatch.ts`
`normalizeBrand(s)`, `suggestBrands(query, existing[], threshold=2)`. Used by `ItemForm` typeahead.

### Backend — `backend/app/services/brand_match.py` (new)
`closest_brand(value, existing_brands) -> str | None`. Used by the import service (§3) and optionally exposed via `GET /items/brands?q=` for the frontend typeahead (preferred over shipping the whole list once).

### Tests
- `ItemForm.test.tsx`: empty brand → validation error; typing "Rossi" suggests "Rossignol".
- `backend/tests/test_brand_match.py`: closest match returns expected; no match returns None; normalization ignores case/whitespace.

---

## 6. Donation-Default Inheritance from Seller

### Requirements
- Inherit donation permission from seller registration onto equipment intake.

### Decisions (option 11b from the Q&A)
- Donation flags **stay on `intake`** (`donate_unsold`, `donate_proceeds`); intake can still override.
- Add **seller-level defaults**: `seller.donate_unsold_default` (Boolean, default False) and `seller.donate_proceeds_default` (Boolean, default False).
- At **intake creation**, the intake's `donate_unsold` / `donate_proceeds` are pre-populated from the seller's defaults if the request omits them. Explicit values in the request still win.
- Per-item `donate_unsold` override on `item` is unchanged.

### Schema / model changes
- `backend/app/models/seller.py`: add `donate_unsold_default = Column(Boolean, nullable=False, default=False)`, `donate_proceeds_default = Column(Boolean, nullable=False, default=False)`.
- Migration `..._add_seller_donation_defaults.py`.
- `backend/app/schemas/seller.py`: add both fields to `SellerCreate`/`SellerUpdate`/`SellerResponse`.
- `backend/app/schemas/intake.py`: `donate_unsold` / `donate_proceeds` on `IntakeCreate` become `Optional[bool] = None`; the intake service fills from seller defaults when null.

### Service — `backend/app/services/intakes.py` (or wherever intake creation lives)
- On create: if `donate_unsold is None` → `seller.donate_unsold_default`; same for `donate_proceeds`.

### Frontend
- `SellerForm.tsx`: add the two donation-default checkboxes.
- `IntakeForm.tsx`: pre-fill the donation checkboxes from the selected seller's defaults; remain editable.

### Tests
- `backend/tests/test_intakes.py`: creating an intake without donation flags inherits seller defaults; explicit flags override.
- `SellerForm.test.tsx`: donation defaults render and save.

---

## 7. Soft Delete of Items

### Requirements
- Add a delete for items that have been entered.
- Delete only before labels are printed (to keep inventory counts current).
- Sold items must not be deletable.
- Soft delete (preserve audit / referential integrity).

### Decisions
- Add `item.is_deleted = Column(Boolean, nullable=False, default=False)`.
- **Delete rule:** allowed only when `item.label_printed == False` **and** `item.status == 'available'` **and** `item.is_deleted == False`. Otherwise 422 with a specific message:
  - label printed → "Cannot delete an item after its label has been printed."
  - status != available (sold/donated/returned) → "Cannot delete an item that has been sold or otherwise disposed."
- Soft delete sets `is_deleted = True`; the row is retained. All item queries filter `is_deleted == False` unless explicitly retrieving for audit.
- `item.quantity` reductions from a soft-deleted item are **not** reverse-applied to any sales (none can exist, since sold items are excluded). No inventory rebalance needed.

### API — `backend/app/routers/items.py`
- `DELETE /items/{id}` — roles `admin | intake`. Sets `is_deleted=True` under the rules above. Returns 204 on success.
- All `GET /items/...` and lookup endpoints add `is_deleted == False` to their queries. The lookup used by checkout also excludes deleted (a deleted item → 404 "Item not found").
- Reports exclude `is_deleted` items from unsold/line-item listings.

### Model / migration
- `backend/app/models/item.py`: add `is_deleted` column.
- Migration `..._add_is_deleted_to_item.py`.

### Frontend
- `ItemList.tsx` / `SellerDetailPage.tsx`: a "Delete" control on each item row, disabled (with tooltip) when `label_printed` or `status != 'available'`. Confirmation dialog before the DELETE call.

### Tests
- `backend/tests/test_items.py`: delete available unprinted item → 204, excluded from listings; delete printed item → 422; delete sold item → 422; delete already-deleted → 422; cashier role → 403; lookup of deleted item → 404.

---

## 8. Quantity Model (Items & Checkout)

### Requirements
- Add quantity to equipment; applies to all items (not just vendor).
- Non-vendor items may be multiples of one item under one code.
- Update quantity after the fact; increases only by the **difference**, decreases cannot go below the number already sold.
- Checkout supports partial-quantity sales.

### Decisions — item quantity
- `item.quantity` already exists (`Float, default=1.0`). It now represents **current on-hand (remaining) quantity** for *all* items.
- On item creation, `quantity ≥ 1` required (int validation: integer ≥ 1; `Float` column retained for backward compatibility but UI/validate as integer).
- `item.status` flips `available` → `sold` on the **first sale of any quantity**; `quantity` continues to reflect remaining stock. `status='sold'` therefore means "at least one unit has sold," **not** "fully depleted." An item with `status='sold'` and `quantity > 0` is partially sold and still sellable.

### Decisions — selling partial quantity (checkout)
- `sale_item.quantity` may be any integer `1..item.quantity` for the sold item at sale time.
- On sale commit, for each line item:
  - `item.quantity -= sale_item.quantity`.
  - `item.status = 'sold'` (status indicates a sale has occurred; `quantity` carries the remaining on-hand count).
  - `extended_price = sell_price * sale_item.quantity`.
- An item remains **sellable while `item.quantity > 0`**, regardless of `status`. When `item.quantity == 0` it is fully sold and cannot be added to a cart. The checkout availability check (Phase 4: "verify `item.status == 'available'") is replaced by **`item.quantity >= requested_quantity` and `item.is_deleted == False`**.
- Atomic sale creation (existing transaction) extended to perform the decrement + status set.
- **Duplicate-scan behavior:** scanning an item already in the cart increments that line's quantity (up to `item.quantity` remaining), rather than adding a second line. Scanning beyond available quantity → inline error "Only N remaining."

### Decisions — void
- On void, for each sale_item: `item.quantity += sale_item.quantity`; then recompute `item.status`: `'sold'` if any non-voided `sale_item` still references this item, else `'available'`. Existing void semantics (preserve sale row, admin-only) unchanged.

### End-of-day & unsold reporting under the new model
- End-of-day donate/return handling and the `UnsoldItemsReport` (Phase 5) now target items with **`quantity > 0`** (remaining stock), regardless of `status`, and `is_deleted == False`. A partially-sold item (`status='sold'`, `quantity > 0`) has its remaining units eligible for donation or return.

### Decisions — update quantity after the fact
- New endpoint `PATCH /items/{id}/quantity` — roles `admin | intake`.
- Request body: `{ "adjustment": int }` (signed integer). **Not** a new total.
  - `adjustment > 0`: `item.quantity += adjustment` (increase by the difference).
  - `adjustment < 0`: `new_qty = item.quantity + adjustment`. Reject (422) if `new_qty < 0`. Since `item.quantity` is *remaining* on-hand, `new_qty >= 0` is equivalent to "implied total (remaining + sold) >= sold" — i.e. the staff cannot reduce the total below the number already sold (Q16).
- The UI asks the user for the **amount to add or remove**, not the new total, and shows current quantity + sold count so the floor is visible.
- Quantity may only be adjusted while `is_deleted == False`. Editing after `label_printed` is **allowed** (counts must stay current per the stakeholder note); no label reprint is triggered automatically.

### API changes — `backend/app/routers/items.py` & `backend/app/routers/sales.py`
- `PATCH /items/{id}/quantity` as above.
- `POST /sales` request line items: `quantity: int = Field(ge=1)` added to `SaleItemCreate`; backend enforces `quantity ≤ item.quantity` at sale time (422 if exceeded).
- `GET /items/lookup` response includes `quantity` and `status`; the POS UI treats `quantity > 0` as sellable (a `status='sold'` item with `quantity > 0` still lookups successfully and shows "N remaining"), while `quantity == 0` shows "sold out".

### Schema changes — `backend/app/schemas/sale.py`
- `SaleItemCreate`: add `quantity: int = Field(default=1, ge=1)`.
- `SaleItemResponse`: `quantity` already present.

### Service — `backend/app/services/checkout.py`
- `create_sale_atomic()`: apply decrement + set `status='sold'` per line; enforce `requested quantity ≤ item.quantity` and `is_deleted == False` (422 "Item {code} has only N remaining" if exceeded); reject duplicate `item_id` in request still (the API rejects explicit duplicate `item_id` entries in one POST; the frontend merges scans client-side).

### Frontend
- `Cart.tsx`: per-line quantity control capped at `item.quantity`; "remaining" indicator.
- `ItemList.tsx` / item detail: quantity display + "Adjust quantity" control (add/remove amount).

### Migration
- None for the column (exists). Possible check constraint optional; logic enforced in service.

### Tests
- `backend/tests/test_checkout_service.py`: partial sale decrements quantity and sets `status='sold'` (remaining > 0 still sellable); selling more than available → 422; selling the last unit leaves `quantity=0`; void restores quantity and recomputes status (sold if other non-voided sales remain, else available).
- `backend/tests/test_items.py`: PATCH increase by difference; PATCH decrease below sold_count → 422; PATCH decrease to exactly sold_count → 200.
- `frontend/src/pos/Cart.test.tsx`: quantity control caps at remaining; duplicate scan increments line.

---

## 9. Sale Record: Timestamp, Cashier Id, Payment Ids, Notes

### Requirements
- Each sale: id, timestamp, list view of equipment, editable to some degree, cashier id.
- For checks and Square transactions, add an id field (check number or transaction id).
- Notes on transactions (for a receipt).

### Decisions
- **Timestamp:** `sale.date_of_sale` migrates from `Date` to `DateTime` (full timestamp, UTC). Renamed semantically to "sale timestamp"; column name retained for compatibility, type changes. Existing rows backfilled to `00:00:00` time on the stored date.
- **Cashier id:** use existing `sale.created_by` (stores the username of the creating user). No new column. Every sale response and on-screen confirmation includes `created_by` labeled "Cashier".
- **Payment ids:**
  - `sale.check_number` (exists) — required when `check_amount > 0`.
  - Add `sale.cc_transaction_id = Column(String, nullable=True)` — captured from the Square payment confirmation; required when `cc_amount > 0`.
  - Cash: no id.
- **Notes:** single `sale.notes` field (exists). Used for transaction/receipt notes. Printed on the receipt if present.

### Migration — `..._sale_datetime_and_cc_txn.py`
- Alter `sale.date_of_sale` from `Date` to `DateTime` (SQLite batch alter; cast existing values to midnight).
- Add `sale.cc_transaction_id` column.

### Schema — `backend/app/schemas/sale.py`
- `SaleCreate`: add `cc_transaction_id: Optional[str] = None`; validators: `check_number` required if `check_amount > 0`; `cc_transaction_id` required if `cc_amount > 0`.
- `SaleResponse` / `SaleWithItemsResponse`: include `cc_transaction_id`; `date_of_sale` becomes `datetime`.

### Frontend
- Confirmation screen + receipt show: sale id, timestamp, cashier (`created_by`), line items, payment breakdown incl. check number / cc transaction id, notes.

### Tests
- `backend/tests/test_sales.py`: sale stores datetime (not just date); cc sale without `cc_transaction_id` → 422; check sale without `check_number` → 422; response includes `cc_transaction_id` and `created_by`.

---

## 10. Single-Page Checkout

### Requirements
- Have checkout on the same screen as items (cart + payment + confirmation together).
- "New Transaction" button on the same screen after confirmation.

### Decisions
- Remove the separate payment screen/step. The current `POSPage` flow (Lookup → Cart → PaymentForm → ConfirmationScreen as distinct steps) collapses into **one page** with three stacked regions:
  1. **Item entry** — `LookupField` + `Cart` (with per-line quantity, price-adjust + notes, remove).
  2. **Payment** — `PaymentForm` (cash/check/cc split, check number, cc transaction id, sale notes) inline below the cart; disabled until cart non-empty.
  3. **Confirmation** — on submit, the same page shows an inline confirmation panel (sale id, timestamp, cashier, totals, items, payments) with a **"New Transaction"** button that clears cart + payment + confirmation and returns focus to the lookup field.
- No route change; no new tab. `ConfirmationScreen` and `PaymentForm` become inline regions of `POSPage` rather than separate navigated screens (they can remain as components, just rendered inline).

### Frontend — `frontend/src/pos/POSPage.tsx`
- Compose `LookupField`, `Cart`, `PaymentForm`, and an inline `ConfirmationPanel` (renamed from `ConfirmationScreen`) in one view.
- State: `phase: 'editing' | 'confirmed'`. On confirm → `confirmed`; "New Transaction" → reset to `editing` and clear state.
- Keep the lookup field focused during `editing`.

### Tests
- `POSPage.test.tsx`: payment region visible on same page as cart; confirmation panel appears after submit; "New Transaction" resets and refocuses lookup.

---

## 11. Price Adjustment at Sale Time

### Requirements
- Ability to adjust price at sale time, with cashier notes about the adjustment.

### Decisions
- **At sale time (checkout) only:** existing `sale_item.sell_price` override + `sale_item.notes` (the "price override reason" field). The notes field is presented explicitly as "Reason for price adjustment" in the UI when the cashier changes the price; recommended (soft-required — warn if empty) but not hard-blocking.
- **No post-confirmation price editing.** Once a sale is confirmed, line prices are immutable. Corrections require an admin **void** of the sale followed by a new checkout. The post-confirmation `PATCH` endpoint proposed earlier is intentionally **dropped**.

### Tests
- `frontend/src/pos/Cart.test.tsx`: changing price reveals a "Reason for price adjustment" notes field; submitting without a note shows a soft warning.
- `backend/tests/test_sales.py`: `sell_price` override + `notes` are stored on the sale_item; sale totals computed from the override.

---

## 12. Reports — Per-Item Commission, Payout, and Rate

### Requirements
- In seller reports, include commission and payout by item.
- Show the rate per line item.
- Non-sold items: commission/payout $0, still listed.

### Decisions
- Extend `SellerPayoutLineItem` (`backend/app/schemas/reports.py`) with:
  - `mysl_share: float` — commission amount for this item (0 for non-sold).
  - `seller_share: float` — payout to seller for this item (0 for non-sold).
  - `commission_rate: float` — the rate that applied (or would apply) to this item, based on `seller.is_vendor` → `event.vendor_commission_rate` else `event.commission_rate`. Shown for all lines including non-sold.
- Per-item shares computed at read time in `get_seller_payout()` using `sale_item.extended_price` (or `sell_price * quantity`) and the applicable rate, honoring `intake.donate_proceeds` (→ `mysl_share = extended_price`, `seller_share = 0`).
- Seller-level `mysl_total` / `seller_total` remain the sums across sold lines.
- Non-sold lines (`status` in `available`/`donated`/`returned`, or sold-from-voided) → `mysl_share = 0`, `seller_share = 0`, `commission_rate` still populated.
- Format renderers (CSV/MD/PDF) render the three new columns per line.

### Schema — `backend/app/schemas/reports.py`
```python
class SellerPayoutLineItem(BaseModel):
    item_code: str
    description: Optional[str]
    price: float
    sell_price: float
    status: str
    mysl_share: float
    seller_share: float
    commission_rate: float
```

### Service — `backend/app/services/reports.py`
- In `get_seller_payout()`, for each item compute shares from its (non-voided) `sale_item` if sold; else 0/0. Rate from seller/vendor flag.

### Tests
- `backend/tests/test_reports.py`: sold item line has correct mysl_share/seller_share/rate; non-sold line has 0/0 + rate; donate_proceeds line has mysl_share = extended_price, seller_share = 0; vendor seller line uses vendor rate; CSV/MD/PDF include the new columns.

---

## 13. Affected Components Summary

### Backend
| Area | Change |
|------|--------|
| `app/models/seller.py` | Relax name NOT NULL; add donation-default columns |
| `app/models/item.py` | Add `is_deleted` column |
| `app/models/sale.py` | `date_of_sale` → DateTime; add `cc_transaction_id` |
| `app/schemas/seller.py` | Vendor/individual validators; email/phone/zip/state validators |
| `app/schemas/intake.py` | Donation flags optional (inherit from seller) |
| `app/schemas/sale.py` | `SaleItemCreate.quantity`; `cc_transaction_id`; payment-id validators; datetime |
| `app/schemas/reports.py` | `SellerPayoutLineItem` += mysl_share, seller_share, commission_rate |
| `app/routers/items.py` | `DELETE /items/{id}`, `PATCH /items/{id}/quantity`, `POST /items/import`; filter `is_deleted` |
| `app/routers/sales.py` | Quantity handling in `POST /sales` |
| `app/services/checkout.py` | Partial-quantity decrement + status flip; enforce ≤ available |
| `app/services/reports.py` | Per-item shares + rate in seller payout |
| `app/services/item_import.py` | **New** — xlsx/csv/tsv parse, validate, error report |
| `app/services/brand_match.py` | **New** — closest-match |
| `app/data/equipment_taxonomy.py` | **New** — shared category→type source (pending mapping) |
| Migrations | relax seller name nullable; seller donation defaults; item is_deleted; sale datetime + cc_transaction_id |

### Frontend
| Area | Change |
|------|--------|
| `src/lib/usStates.ts` | **New** — US state list |
| `src/lib/equipmentTaxonomy.ts` | **New** — categories + types_by_category (pending) |
| `src/lib/brandMatch.ts` | **New** — normalize + suggest |
| `src/intake/SellerForm.tsx` | Conditional required fields, state dropdown, zip/phone validation, donation defaults |
| `src/intake/IntakeForm.tsx` | Pre-fill donation from seller defaults |
| `src/intake/ItemForm.tsx` | Category→Type→Size cascade; brand typeahead; quantity field |
| `src/intake/ItemList.tsx` / `SellerDetailPage.tsx` | Soft-delete control; quantity adjust; import formats |
| `src/pos/POSPage.tsx` | Single-page checkout (cart + payment + confirmation inline) |
| `src/pos/Cart.tsx` | Per-line quantity (capped), price-adjust + notes, remove |
| `src/pos/ConfirmationPanel.tsx` | Inline confirmation + New Transaction; show cashier/timestamp/payment ids |
| `src/types.ts` | Update types for new fields |

---

## 14. Out of Scope

- Vendor self-service portal (import remains staff-initiated on behalf of a registered seller).
- Public seller pre-registration (unchanged from v1).
- Hard delete of items or sales (audit preserved via soft delete / void).
- Auto-reprinting labels when quantity is adjusted post-print.
- Recomputing historical payouts retroactively when event commission rates change after the fact.
- Non-US state/province support in the seller address dropdown.