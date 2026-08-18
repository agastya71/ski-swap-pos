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

### Notes / deviations
- Used regex email validation instead of Pydantic `EmailStr` to avoid adding the `email-validator` dependency.
- `SellerUpdate` does not enforce cross-field (name-vs-company / phone-or-email) rules — only field-level format. Documented in schema docstring + spec.

---

## Phase 2 — Donation-Default Inheritance (pending)
## Phase 3 — Soft Delete + Quantity Model (pending)
## Phase 4 — Single-Page Checkout + Sale Timestamp + Payment IDs (pending)
## Phase 5 — Brand Matching + Bulk Import (pending)
## Phase 6 — Category→Type→Size Cascade (blocked: pending stakeholder mapping)
## Phase 7 — Reports Per-Item Commission/Payout/Rate (pending)