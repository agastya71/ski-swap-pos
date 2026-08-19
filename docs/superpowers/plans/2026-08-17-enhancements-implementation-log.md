# Enhancements Implementation Log

**Spec:** `docs/superpowers/specs/2026-08-17-intake-checkout-reports-enhancements-design.md`
**Workflow:** one branch + PR per phase; tests run before and after; PR review success criterion = tests pass (no new failures). UI is tested headlessly via Vitest + jsdom.

## Baseline (before Phase 1)

| Suite | Result |
|---|---|
| Backend (`pytest`) | 164 passed |
| Frontend (`vitest`) | 159 passed / 5 failed |

The 5 frontend failures are **pre-existing on `main`** in `src/pos/POSPage.test.tsx` (duplicate-element queries: "Found multiple elements with the text: A001-001" / "multiple buttons named remove"). They are in the file Phase 4 (single-page checkout) will rewrite; left untouched to avoid wasted rework. Tracked as the known-baseline; success criterion per phase = no *new* failures.

---

## Phase 1 — Seller Registration Validation

**Branch:** `feat/phase-1-seller-validation`
**Spec section:** §2

### Changes
- **Migration** `a1b2c3d4e5f6_relax_seller_name_nullable.py`: drop NOT NULL on `seller.first_name` / `seller.last_name` (vendors are businesses, not people). Verified applies cleanly; `PRAGMA table_info` confirms `notnull=0`.
- **Model** `app/models/seller.py`: `first_name` / `last_name` → `nullable=True`.
- **Schema** `app/schemas/seller.py`: validation moved to Pydantic.
  - `SellerCreate`: `first_name`/`last_name` optional; `address`/`city` required; `state` 2-char required; `zip` US 5-digit required; `email` regex; `phone` normalized to 10 digits (US/Canada); cross-field validators — vendor requires `company`, individual requires `first_name`+`last_name`, at least one of phone/email.
  - `SellerUpdate`: per-field format validators only (no cross-field; partial patch can't see existing record state — documented).
  - `SellerResponse`: `first_name`/`last_name` → `Optional[str]`.
- **Tests** `tests/helpers.py` (new): `valid_seller_create()` / `valid_vendor_create()` DRY payload builders. Updated `test_sellers.py`, `test_intakes.py`, `test_items.py` to use them (existing minimal-seller POSTs now include valid contact + address). Added 12 validation tests.
- **Frontend** `src/lib/usStates.ts` (new): 50 states + DC. `src/types.ts`: `Seller.first_name`/`last_name` → `string | null`; `SellerCreate.first_name`/`last_name` optional. `src/intake/SellerForm.tsx`: state `<select>`, ZIP `pattern="\d{5}" maxLength=5`, conditional required (first/last for individuals, company for vendors), address/city/state/zip required, client phone-or-email check. `src/admin/SellerDetailPage.tsx`: null→undefined coercion for the update payload. `src/intake/SellerForm.test.tsx`: updated + 5 new tests (state select, ZIP pattern, conditional required, phone-or-email block, vendor body omits names).

### Test results (after Phase 1)
| Suite | Result | Δ |
|---|---|---|
| Backend | 176 passed | +12 (new validation tests) |
| Frontend | 164 passed / 5 failed | +5 (new SellerForm tests); 5 failures unchanged pre-existing |
| `tsc -b` (typecheck) | clean | — |

### Status
**Merged** — PR #42 (squash), commit `20af070` on `main`.

### Notes / deviations
- Used regex email validation instead of Pydantic `EmailStr` to avoid adding the `email-validator` dependency.
- `SellerUpdate` does not enforce cross-field (name-vs-company / phone-or-email) rules — only field-level format. Documented in schema docstring + spec.

---

## Phase 2 — Donation-Default Inheritance

**Branch:** `feat/phase-2-donation-defaults`
**Spec section:** §6

### Changes
- **Migration** `b2c3d4e5f6a7_add_seller_donation_defaults`: adds `seller.donate_unsold_default` and `seller.donate_proceeds_default` (Boolean, NOT NULL, default false). Verified applies; `PRAGMA table_info` confirms `notnull=1 dflt=0`.
- **Model** `app/models/seller.py`: two new columns.
- **Schema** `app/schemas/seller.py`: fields added to `SellerCreate` (default false), `SellerUpdate` (optional), `SellerResponse`.
- **Schema** `app/schemas/intake.py`: `IntakeCreate.donate_unsold` / `donate_proceeds` → `Optional[bool] = None` (null = inherit).
- **Router** `app/routers/intakes.py`: at intake creation, `None` resolves to the seller's default; explicit values win.
- **Tests**: `test_intakes.py` +3 (inherit, explicit override, default-false); `test_sellers.py` +2 (create records defaults, patch defaults).
- **Frontend**: `types.ts` adds the fields to `Seller`/`SellerCreate`/`SellerUpdate`; `SellerForm.tsx` adds two "Donation defaults" checkboxes; `IntakeForm.tsx` pre-fills checkboxes from seller defaults and re-seeds on seller change (vendor-aware heading). Updated all `Seller` test fixtures + `mocks/handlers.ts`. +3 frontend tests.

### Test results (after Phase 2)
| Suite | Result | Δ from Phase 1 |
|---|---|---|
| Backend | 181 passed | +5 |
| Frontend | 167 passed / 5 failed | +3 (new); 5 failures unchanged pre-existing |
| `tsc -b` | clean | — |

### Status
Merged via PR (see git history).


## Phase 3 — Soft Delete + Quantity Model

**Branch:** `feat/phase-3-soft-delete-quantity`
**Spec section:** §7 (soft delete) + §8 (quantity model)

### Decisions / clarifications
- `item.quantity` is **remaining on-hand** (decrements on sale, per Q15). An item is sellable while `quantity > 0`; `status` flips to `sold` on the first sale of any quantity (so `status='sold'` may coexist with `quantity > 0`).
- **PATCH quantity floor = `new_qty >= 0`** (not `new_qty >= sold_count`). Rationale: since `quantity` is remaining, `new_qty >= 0` is *equivalent* to "implied total (remaining + sold) >= sold" — which is exactly Q16's "cannot reduce below sold." The spec §8 was corrected accordingly.
- Soft delete via `item.is_deleted`; hard delete removed. Delete allowed only when `label_printed == False` and `status == 'available'`. Deleted items 404 from get/lookup and are excluded from listings/reports/checkout.
- UnsoldItemsReport and donations-unsold now filter `quantity > 0` + `is_deleted == False` (remaining stock), replacing `status == 'available'`.
- Checkout-side Cart quantity UI deferred to Phase 4 (which rewrites POSPage); backend supports partial-quantity sales now.

### Backend changes
- Migration `c3d4e5f6a7b8_add_is_deleted_to_item`; `Item.is_deleted` column.
- `ItemResponse` += `is_deleted`; new `ItemQuantityAdjustment` schema; `SaleItemCreate.quantity` (int ≥ 1).
- `items.py`: `DELETE` → soft delete; new `PATCH /items/{id}/quantity`; `is_deleted` filtering in get/lookup/search.
- `sellers.py`: `list_seller_items` filters `is_deleted`.
- `checkout.py`: partial-quantity — uses `line.quantity`, enforces `≤ remaining`, decrements `item.quantity`, sets `status='sold'`, rejects deleted (404) and sold-out/over-remaining (422 "only N remaining").
- `sales.py` void: restores `item.quantity` and recomputes `status` (sold if any non-voided sale_item remains, else available).
- `reports.py`: unsold + donations-unsold filter `quantity > 0`; seller payout items filter `is_deleted`.

### Frontend changes
- `types.ts`: `Item.is_deleted`, `SaleItemCreate.quantity`.
- `api/items.ts`: `adjustItemQuantity(id, delta)`.
- `ItemList.tsx`: Qty column; quantity adjust control (signed delta + Apply); Delete disabled when `label_printed` OR `status != 'available'`. colSpan bumped to 7.
- Updated all `Item`/`ItemLookupResponse` test fixtures + MSW handlers with `is_deleted: false`. +3 ItemList tests.

### Test results (after Phase 3)
| Suite | Result | Δ from Phase 2 |
|---|---|---|
| Backend | 192 passed | +11 |
| Frontend | 170 passed / 5 failed | +3 (new); 5 failures unchanged pre-existing |
| `tsc -b` | clean | — |

### Status
Merged via PR (see git history).


## Phase 4 — Single-Page Checkout + Sale Timestamp + Payment IDs

**Branch:** `feat/phase-4-single-page-checkout`
**Spec section:** §9 (sale record), §10 (single-page checkout), §11 (price adjustment at sale time)

### Backend
- Migration `d4e5f6a7b8c9_sale_datetime_and_cc_txn`: `sale.date_of_sale` Date → DateTime (full timestamp); adds `sale.cc_transaction_id`.
- `Sale` model: `date_of_sale` DateTime, `cc_transaction_id` String nullable.
- `SaleCreate`: adds `cc_transaction_id`; model validator — `check_number` required when `check_amount > 0`, `cc_transaction_id` required when `cc_amount > 0`.
- `SaleResponse`: `date_of_sale` is now datetime; includes `cc_transaction_id`.
- `checkout.py`: `date_of_sale = datetime.now(timezone.utc)`; passes `cc_transaction_id`.
- Tests: updated payment-split test (adds cc_transaction_id); +3 (check-without-number 422, cc-without-txn-id 422, timestamp+cashier recorded).

### Frontend
- **Single-page checkout**: `POSPage` rewritten — cart + payment + confirmation on one screen; `phase: 'editing' | 'confirmed'`; no separate payment step. Payment form always visible below cart (Complete Sale disabled while cart empty); confirmation inline with New Transaction.
- **Cart** rewritten to `CartLine` ({item, quantity, sell_price, notes}): editable quantity (capped at item.remaining), editable unit price, price-adjustment notes field (shown when price overridden), Remove. Duplicate scan increments line quantity (capped). Running total = Σ sell_price × quantity.
- **PaymentForm**: added check number (shown when check > 0) and sale notes fields; `onSubmit` now carries `checkNumber` + `notes`.
- `POSPage.handlePayment` sends per-line `quantity`/`sell_price`/`notes`, `check_number`, `cc_transaction_id` (= Square token when card), sale `notes`.
- types: `SaleCreate.cc_transaction_id`; `SaleResponse/SaleWithItemsResponse.cc_transaction_id`.
- **Fixed the 5 pre-existing `POSPage.test.tsx` failures** (root cause: un-mocked `/items/search` debounce + localStorage cart leaking between tests). Added `localStorage.clear()` to global test-setup `afterEach`; POSPage tests mock `/items/search` → [].
- Rewrote `Cart.test.tsx`, `POSPage.test.tsx`; updated `PaymentForm.test.tsx` + `ConfirmationScreen.test.tsx` fixtures.

### Test results (after Phase 4)
| Suite | Result | Δ from Phase 3 |
|---|---|---|
| Backend | 195 passed | +3 |
| Frontend | **177 passed / 0 failed** | +7 net; **5 pre-existing failures fixed** |
| `tsc -b` | clean | — |

### Status
Merged via PR (see git history).


## Phase 5 — Brand Matching + Bulk Import

**Branch:** `feat/phase-5-brand-match-bulk-import`
**Spec section:** §3 (bulk import) + §5 (brand matching)

### Backend
- **`app/services/brand_match.py`** (new): `normalize_brand`, `closest_brand(value, existing, threshold=2)` via normalized Levenshtein. Catches typos ("Rossignnol"→"Rossignol"); abbreviations ("Rossi") are out of threshold by design.
- **`app/services/item_import.py`** (new): `parse_upload` (xlsx via openpyxl, csv/tsv via stdlib csv) + `import_items` (validates, applies brand closest-match, commits valid rows, collects per-row errors). Brand required on import.
- `intakes.py` import endpoint refactored to use the service; now supports **.xlsx, .csv, .tsv**.
- **Brand required**: `ItemCreate.brand` is now `min_length=1`.
- **`GET /items/brands?q=`** endpoint (admin/cashier): distinct brands for the active event, for the frontend typeahead.
- Tests: `test_brand_match.py` (4 unit) + `test_items.py` +6 (brand required 422, brands endpoint, CSV import, brand closest-match on import, brand-missing skip). Updated existing add-item/import tests to include brand.

### Frontend
- `api/items.ts`: `fetchBrands(q)`.
- `ItemForm.tsx`: brand field **required** + **typeahead datalist** (fetches `/items/brands?q=` as the user types).
- `SellerDetailPage.tsx`: import button relabeled "Import Items", file input `accept=".xlsx,.csv,.tsv"`.
- `types.ts`: `ItemCreate.brand` required.
- MSW: default `/items/brands` handler returning [] (so typeahead doesn't fire unhandled requests in tests).
- Tests: updated ItemForm submit tests to fill brand; +1 typeahead datalist test; fixed Import button test.

### Test results (after Phase 5)
| Suite | Result | Δ from Phase 4 |
|---|---|---|
| Backend | 204 passed | +9 |
| Frontend | 178 passed / 0 failed | +1 (net; suite stayed green) |
| `tsc -b` | clean | — |

### Status
Merged via PR (see git history).


## Phase 6 — Category→Type→Size Cascade (blocked: pending stakeholder mapping)
## Phase 7 — Reports Per-Item Commission/Payout/Rate (pending)