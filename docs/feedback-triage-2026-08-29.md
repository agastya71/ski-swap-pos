# Feedback triage — tester notes (2026-08-29)

Maps the latest tester feedback onto the codebase. Statuses: ✅ already implemented (no work),
🐛 broken/bug, 🔧 needs building, ❓ needs a decision.

## P0 — checkout correctness (fix before any sale session)

**STATUS: fixed 2026-08-29** (frontend PR-in-progress; all 213 frontend tests pass, SPA rebuilt to `backend/static`). Fixes:

1. Cancel now abandons the whole checkout (confirmation when the cart is non-empty, clears cart + payment state, back to lookup) — `POSPage.handleCancelCheckout`.
2. The completed sale is persisted under `pos_sale`; after reload the cashier sees the read-only receipt + New Transaction instead of an editable cart of sold items — `POSPage`.
3. `ApiError` now flattens FastAPI's 422 `detail` arrays into readable text; PaymentForm validates check-number / card-transaction-ID client-side with clear field errors, and a manual card amount + transaction id can be entered for terminal (non-SDK) card payments.

| Task | Where | Done when |
|---|---|---|
| 🐛 Cancel in checkout doesn't cancel. `PaymentForm` Cancel → `POSPage.onCancel` only clears `squareToken`/`error`; the cart stays. Make Cancel abandon the transaction: confirm → clear cart (localStorage + state) + reset payment fields back to lookup state. | `frontend/src/pos/POSPage.tsx`, `PaymentForm.tsx` | Cancel empties cart and returns to lookup mode |
| 🐛 Reload after completing a sale leaves the sold cart "live". Cart persists under `pos_cart` but `sale` state doesn't; after reload the sold items reappear editable, Complete Sale fails server-side (items sold) with a cryptic error, and Cancel can't clear. Persist checkout phase (editing / completed + sale id) in localStorage; on restore of a completed sale show the read-only receipt + "New Transaction". Also guard against re-submitting a sale whose items are already sold. | `POSPage.tsx` | Reload of a completed checkout shows the receipt, not an editable cart |
| 🐛 Sale-required-field errors are invisible. Backend already rejects check w/o number (check_amount > 0 ⇒ check_number required; cc_amount > 0 ⇒ cc_transaction_id required) — but FastAPI 422 returns `detail` as an array and `apiFetch` stringifies it garbled, so cashiers see no useful text. Fix `ApiError` to render 422 validation arrays; add client-side validation in PaymentForm ("Check number required", "Card transaction ID required") so it fails without a round-trip. Also add a manual "Card transaction ID" input for card sales not captured via the Square SDK. | `frontend/src/api/client.ts`, `pos/PaymentForm.tsx` | Missing check number shows "Check number required" at the field, never a cryptic error |

## P1 — intake workflow correctness

**STATUS: P1 complete as of 2026-08-29 (second batch)** — all six items fixed. Second batch added: per-row Delete in ItemList (confirm + guardrails + inline errors), donation-inheritance hints on ItemForm/IntakeForm (SellerDetailPage Add Item now passes the seller default), and **N labels per N units** — `generate_zpl` emits `^PQ{quantity}` so an item with quantity=3 prints three tags sharing one item code (Amy's decision applied).

What shipped: `app/services/canonical.py` (canonical category/type vocabularies), `/items/brands?category=` filter, `/items/import-template` 12th Quantity column, `item_import.py` parses Quantity (blank = 1, non-integer/≤1 rejected with row errors) + case-normalizes Category/Type; `zpl.py` ^PQ copies; `schemas/seller.py` state before-validator; frontend `CATEGORY_TYPES`/`typesForCategory` (Skis includes Skate/Classic per tester example), ItemForm category→Type narrowing + reset + Quantity field + inheritance hint, category-scoped brand typeahead, per-row ItemList Delete, IntakeForm inheritance hint, plus a **Download Template** button beside Import Items.

| Task | Where | Done when |
|---|---|---|
| ✅ 2026-08-29 🔧 Category-dependent Type list. `CATEGORY_TYPES` + `typesForCategory()` in `lib/itemSizes.ts` (mirror: `app/services/canonical.py`), Type dropdown filtered by Category (full list until a category is chosen; unmapped/unknown categories fall back to full list), Type/Size reset on category change. Skis = Alpine Ski/Skate/Classic/Nordic per tester example. | `frontend/src/intake/ItemForm.tsx`, `frontend/src/lib/itemSizes.ts` | Done |
| ✅ 2026-08-29 🔧 Category-dependent Brand list. `/items/brands?category=` returns only brands assigned to that category (case-insensitive); the intake typeahead passes the selected category. Free text kept with filtered suggestions so new brands remain addable. | `routers/items.py`, `api/items.ts`, `ItemForm.tsx` | Done |
| ✅ 2026-08-29 🔧 Quantity on the intake Add Item form. Quantity field (default 1, integer ≥ 1) at first entry; one item record with quantity=N; labels print N copies (ZPL `^PQ`, "N labels per N units" decision applied 2026-08-29). | `frontend/src/intake/ItemForm.tsx`, `app/services/zpl.py` | Done |
| ✅ 2026-08-29 🔧 Import template + importer: Quantity column (+ case-insensitive Category/Type normalization). 12th template column; blank = 1; older 11-column templates still work; non-integer/≤1 get per-row errors. | `backend/app/services/item_import.py`, `routers/items.py`, Download Template button on ImportItemsButton | Done |
| ✅ 2026-08-29 🔧 Make Delete visible. **Per-row Delete button** in ItemList (aria-label `Delete {code}`, confirm dialog, tooltip explaining why disabled). Same soft-delete guardrails as the edit-panel Delete (refused once labels printed / item sold); delete failures surface inline via `deleteError`. | `frontend/src/intake/ItemList.tsx` | Done |
| ✅ 2026-08-29 🐛 Verify donation-permission inheritance + make it visible. End-to-end chain seller → intake → item verified (already covered by API tests; intake inherits seller defaults, items inherit intake unless overridden). Surfaced in UI: IntakeForm fieldset hint "Pre-filled from {seller}'s registration — items inherit these unless overridden per item"; ItemForm Donate checkbox hint "Intake default: donate unsold Yes/No — inherited from the seller's registration"; SellerDetailPage Add Item now passes the seller default. | `IntakeForm.tsx`, `ItemForm.tsx`, `SellerDetailPage.tsx` | Done |

## P2 — polish / decisions

| Task | Where | Notes |
|---|---|---|
| ✅ 2026-08-29 🔧 Case tolerance for entered values (the "camel case" item) | see below | Done. (1) **State**: backend now trims+uppercases *before* Pydantic constraints — `_coerce_state_before_constraints` in `app/schemas/seller.py` — fixing a real bug where `" VT "` returned 422 (`max_length=2` ran before normalization; caught by the new regression test). Regression tests pin `vt`/`Vt`/`" VT "` on create and lowercase on update; admin seller-edit already uses the dropdown (done earlier). (2) **Bulk import**: Category/Type case-insensitively canonicalized to `app/services/canonical.py` values ("skis" → "Skis", "ALPINE SKI" → "Alpine Ski"), unknown values stored as typed, never rejected; brand already handled by closest-match; Used/Donate already case-insensitive. (3) **Intake brand entry**: typeahead matches case-insensitively (`normalize_brand`); Title-Case-on-save for new brands remains optional polish. |
| ✅ 2026-08-29 🔧 Intake price = whole dollars. Decision (2026-08-29): **prices are whole dollars, rounded UP to the nearest dollar**. Bulk import applies `math.ceil` to every row's Price (24.5 → 25, 0.25 → 1); the manual Add Item form computes the ceiling on submit and shows a live "Rounds up to $X (whole dollars only)" note while cents are typed. POS sale-price overrides and item edit-panel prices are untouched (feedback scoped to intake). | `item_import.py`, `ItemForm.tsx` | Done |
| ❓ Year field — keep as-is (optional) until Amy answers; no code change made. | | Pending Amy |
| 🔧 Searchable list views (Sellers, Intakes, Sales, Items) | SellerList partially has `?q=`; needs global Item search, Sales list/search, Intakes list | "We should discuss this" — scope first: which columns, who can search, POS-side vs admin-side |
| 🔧 Notes on transactions — verify end-to-end | Sale.notes + per-line notes exist; confirm notes render on confirmation screen/receipt + any printout the swappers get | Likely just a receipt-rendering check |

## Already working — close as done

- Address / City / required + 2-char State dropdown + 5-digit ZIP (seller schemas validate; SellerForm has the dropdown) — the tester's ✓.
- Brand required (backend Field min_length + front-end required).
- Check-number / Square transaction ID capture exists in the data model and sale creation; only the error UX is broken (P0 above).
- Import by user (individual) flow exists (legacy SwapSoft CSV import assessment merged); only the quantity column is missing.

## Suggested order

1. P0 checkout trio (Cancel, reload/stale state, error text) — one PR, plus tests in POSPage/PaymentForm.
2. Category→Type + category→Brand (shared mapping work, also feeds the import template).
3. Quantity at intake + import template Quantity (same data-model decision).
4. Delete visibility + donation-inheritance surfacing (small UI changes).
5. P2 polish + the Amy/discussion items.

## Questions back to the requester / Amy

1. Year field: keep, hide, or remove? (Ask Amy.)
2. Whole-dollar pricing: reject cents or auto-round (up/down)?
3. "Cancel" on checkout: abandon the whole cart (recommended) or just the payment step?
4. Search lists: admin-only or also for cashiers at POS? Which entity matters most for day-of support?
5. For imported rows with quantity N: one item row with quantity N (single label, sells N units), or duplicate into N rows/labels?