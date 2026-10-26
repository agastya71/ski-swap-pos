# Transaction Editing (change / add / remove sale line items) — Design

**Date:** 2026-10-25 · **Status:** PLANNED — decisions confirmed (D1: cashiers edit own sales only, admins all; zero-line sales forbidden), not yet implemented
**Request:** "As a cashier or an admin I would like to be able to edit a completed
transaction (in case of mistakes) — change/add/remove individual line items."

## 1. Current state (facts)

- A completed Sale is **immutable**: no PATCH/PUT/DELETE exists on `/sales` or
  its lines (`backend/app/routers/sales.py`). Money totals
  (`sale_total`, `mysl_total`, `seller_total`, `total_paid`, `balance_due`) are
  pre-computed and stored at creation (`app/services/checkout.py
  create_sale_atomic`).
- The only correction path today is **full void**:
  `POST /sales/{sale_id}/void` (`sales.py:78`) — **admin-only**
  (`_ADMIN_ONLY`, `sales.py:17`), restores every line's units to
  `item.remaining`, recomputes item status, excludes the sale from all money
  aggregations, and refuses double-void (409). Voided sales remain listed/flagged
  in My Transactions and reports (`is_voided`).
- Frontend has `voidSale()` (`frontend/src/api/sales.ts:52`) with MSW mocks but
  **no UI button calls it** — admin voids via Swagger/curl only.
- Per-line commission at creation:
  `compute_commission(extended, intake.donate_proceeds, event.commission_rate)`
  — `extended = round(sell_price × quantity, 2)`; donate-proceeds lines send the
  whole extended price to MYSL.

## 2. Goals / non-goals

**Goals**

- Cashiers can edit **their own** non-voided sales; admins can edit **any**
  non-voided sale in the active event:
  - edit a line's quantity, price, notes
  - add a line (existing sellable item)
  - remove a line (units re-stocked; a sale always keeps at least one line)
  - fix payments (cash / check + number / card + Square ref), customer
    name/email, sale notes
- Every change is atomic, totals are recomputed exactly like checkout, and a
  complete audit history is visible in the UI.
- Void stays available (admin) as the "wrong sale entirely" path.

**Non-goals (v1)**

- Un-voiding a voided sale (re-enter a new sale instead).
- Editing voided sales.
- Editing items across events / creating sales from the editor.
- Changing `date_of_sale` (keep recorded time; edits are audit-time-stamped).

**Confirmed by user, 2026-10-25**

| # | Decision | Confirmed |
| - | -------- | --------- |
| D1 | Who may edit | `admin` may edit **any** sale in the active event; `cashier`/`cashier_intake` may edit only sales where `sale.created_by == current_user.username` (their own), else **403** "You can only edit your own transactions". |
| D8 | Zero-line sales | **Forbidden** — removing the last remaining line of a sale returns **422** "Sale keeps at least one line — void it instead". No sale can ever have zero lines (creation already requires ≥ 1 item). |

**Defaults proposed (accepted unless overridden)**

| # | Decision | Default |
| - | -------- | ------- |
| D2 | Removed lines | **Hard-delete** the `sale_item` row; the audit table preserves the full previous line JSON. A soft-delete flag would have to be threaded through every report query (payouts, end-of-day, transactions) and risks stale money rows. |
| D3 | Commission recompute | Recompute commission **only for touched lines**, at the *current* `event.commission_rate` + that line's `intake.donate_proceeds`; untouched lines keep their stored shares. Sale totals = sum of stored line values (mirrors checkout). Caveat documented: if the event rate changed since the sale, edited vs unedited lines blend old/new rates — acceptable and audited. |
| D4 | Stock invariants | Adding lines / raising quantity requires `item.remaining ≥ added units` (422 mirrors checkout's "Item {code} has only N remaining"). Removing / lowering returns units but **never above intake quantity** (`remaining ≤ quantity` invariant). |
| D5 | Void permission | Stays **admin-only** (same as today). Cashiers see void as a suggestion: ask an admin or re-enter. |
| D6 | Admin "all sales" list | Add a small admin-only `GET /sales` list endpoint (paginated, filter by cashier, include/exclude voided) powering a new admin Transactions page. Without it admins can only reach sales by id. |
| D7 | Edits after end-of-day export | Allowed (audit trail records who/when); UI warns once. Reports exported earlier are snapshots and keep old numbers — note in runbook. |

## 4. Data model

**New table `sale_edit`** (one alembic revision; applies to `swap.db` + every
`events/*.db` through the existing per-event migration machinery — no data
migration, pure additive):

- `id` INTEGER PK
- `sale_id` INTEGER FK `sale.id` NOT NULL (indexed together with edited_at)
- `sale_item_id` INTEGER NULL (the line, for line actions)
- `action` String NOT NULL — `add_line | update_line | remove_line |
  update_payments | update_info`
- `before` JSON NULL / `after` JSON NULL — line or sale-field snapshots
- `edited_by` String NOT NULL, `edited_at` DateTime NOT NULL

**No new columns on `sale` or `sale_item`** (D2). Existing `updated_at`
columns already update automatically.

## 5. Service layer — new `app/services/sale_edit.py`

All operations: load sale scoped to the active event (404 "Sale not found"),
reject voided sales (409 "Sale already voided"), enforce **D1 ownership** —
non-admin roles must match `sale.created_by`, else 403 — mutate **once inside
a single transaction** (validate-then-apply pattern of `create_sale_atomic`),
recompute whole-sale totals, write audit rows, commit, return the refreshed
sale.

- `add_line(sale_id, item_id, quantity 1..N, sell_price=None, notes=None)`
  - item must exist in the active event, `is_deleted=False` → 404/422
  - duplicate-item guard: if that item already has a line on this sale →
    422 "Item {code} is already on this sale — adjust its quantity instead"
    (mirrors checkout's duplicate-item contract)
  - `Sell price` default = current `item.price`; extended =
    `round(price × qty, 2)`; `item.remaining -= qty`; `item.status = "sold"`
- `update_line(sale_id, sale_item_id, {quantity?, sell_price?, notes?})`
  - quantity delta: `>0` → withdraw units (D5 guard); `<0` → restore units
    (`remaining + restore ≤ item.quantity` else 422); recompute item status
  - price/quantity change → extended recomputed, commission via
    `compute_commission(...)` with current rate (D3)
- `remove_line(sale_id, sale_item_id)` — hard delete, restore units, recompute
  item status (`"available"` when no non-voided `sale_item`s remain — the same
  status logic as `void_sale`); **D8**: if it is the sale's last line →
  422 "Sale keeps at least one line — void it instead"
- `update_sale(sale_id, {cash_amount?, check_amount?, check_number?,
  cc_amount?, cc_transaction_id?, customer_name?, customer_email?, notes?})`
  — amounts must be ≥ 0 (422); recompute `total_paid = round(cash + check +
  cc, 2)` and `balance_due = round(sale_total − total_paid, 2)` exactly like
  creation (negative `balance_due` = change already returned)
- Totals recompute after any line op:
  `sale_total = round(Σ extended)`, `mysl_total = round(Σ line mysl)`,
  `seller_total = round(Σ line seller_share)`

## 6. API (extend `app/routers/sales.py`; keep `/mine` registered first)

| Method & path | Roles | Body | Response |
| ------------- | ----- | ---- | -------- |
| `PATCH /sales/{sale_id}` | admin any sale · cashier/cashier_intake **own only** (D1) | payment + customer fields | `SaleWithItemsResponse` |
| `POST /sales/{sale_id}/lines` | same | `{item_id, quantity, sell_price?, notes?}` | `SaleWithItemsResponse` |
| `PATCH /sales/{sale_id}/lines/{sale_item_id}` | same | `{quantity?, sell_price?, notes?}` | `SaleWithItemsResponse` |
| `DELETE /sales/{sale_id}/lines/{sale_item_id}` | same | — | `SaleWithItemsResponse` |
| `GET /sales/{sale_id}/edits` | same | — | `list[SaleEditResponse]` (history, newest first; READ-ONLY — stays viewable for voided sales so the audit trail of a voided sale survives; mutations are still 409) |
| `GET /sales` | **admin only** (D6) | query: `limit`, `offset`, `created_by?`, `include_voided?` | `list[SaleWithItemsResponse]` |

Item codes resolve in the frontend via the existing lookup endpoint
(`GET /items/lookup?...`, used by the POS `LookupField`) — the API stays
id-based like checkout. Optional `?dx/dy`-style param pattern not applicable.

## 7. Frontend

**New shared editor component** (`frontend/src/pos/TransactionEditor.tsx`),
reusing existing patterns:

- inline qty/sell_price inputs per line (Cart table style,
  `frontend/src/pos/Cart.tsx`), remove-line with confirm dialog
  (ItemList delete style)
- "Add item" row using `LookupField` (type/scan code → qty)
- payment fields reusing `pos/PaymentForm.tsx` inputs (cash, check, check
  number, card, Square ref)
- live sale-total display; inline 422/409 error surfacing; Save per action
  (each endpoint returns the updated sale → refresh state)
- "History" panel fed by `GET /sales/{id}/edits` (who / when / what changed)

**Entry points**

1. **My Transactions** (cashier + admin who use the POS, `POSPage.tsx:369+`):
   an "Edit" button on each expanded non-voided transaction opens the editor
   inline.
2. **Admin → new Transactions page** (`admin/TransactionsPage.tsx`, D6):
   paginated list of all event sales with filter by cashier + voided toggle;
   row click opens the same editor; **Void** button (admin-only, confirm
   dialog) in the same place — closes the "no void UI" gap.

Cashiers get only Edit (void omitted per D5).

## 8. Edge cases

- Sale voided concurrently / already voided → 409 from every edit route.
- Item soft-deleted while on a sale line → removing/decreasing allowed;
  adding it again → 422 "item is deleted".
- Item re-sold in the meantime → add/raise-qty hits the remaining guard (422
  with the live remaining count) exactly like checkout.
- `quantity < 0`, `quantity = 0` (use DELETE for that), non-positive prices
  → 422 (mirror checkout validation).
- Last line removed → **forbidden (D8, 422)** — void the sale instead, so a
  sale can never end up with zero lines.
- Ownership (D1): a cashier hitting another cashier's sale on any edit route →
  403 (also for the history endpoint); the editor is only offered for the
  user's own sales in My Transactions, but the guard is server-side.
- Two users editing the same sale → last-write-wins (single-writer SQLite,
  per-request atomicity); optimistic-lock via `updated_at` is a follow-up if
  ever needed.

## 9. Testing

**Backend** (`.venv/bin/python -m pytest -q` from `backend/`; new
`tests/test_sales_edit.py`, ~25–30 cases):

- add/add/update/remove math: remaining withdraw/restore, D5 upper-bound
  invariant, status transitions (`sold`/`available` incl. partial-quantity
  items), duplicate-item add, deleted-item add, price override + commission
  recompute (donate and non-donate lines), whole-sale totals equality with
  checkout math
- payments patch: totals, `balance_due` sign, negative amount 422
- guards: voided sale 409 on all routes; roles + **D1 ownership** (cashier
  edits own sale OK; a cashier editing another cashier's sale → 403 on every
  route incl. `/edits`; admin edits any sale OK; plain `intake` 403);
  **D8 zero-line** (removing a 1-line sale's last line → 422, then void
  succeeds); route-order regressions (`/mine`, `/edits` before `/{id}`)
- audit: `sale_edit` rows written per action; `GET /{id}/edits` payload shape
- admin list endpoint: filters + non-admin 403

**Frontend** (`npm test` vitest + MSW handlers for new endpoints):

- editor render/edit/save flows; qty re-entry increments the line (matches
  POS behavior); remove confirm; 422 inline error; history list; admin page
  list→editor flow; Void visible only for admin; all new tests seeded via
  `setToken()` per conventions.

## 10. Rollout (per AGENTS.md)

1. Feature branch → PR → user approval → squash-merge (`scripts/merge-pr.sh`
   #) → pull main → re-run both suites.
2. `sudo systemctl restart ski-swap-pos` (once) — backend routes/services
   change; migration applies on startup per-event DB.
3. DB backup before the restart (routine); `npm run build` → SPA live from
   `backend/static/` immediately.
4. Docs: user-guide (POS §"correcting a transaction" + admin page),
   runbook troubleshooting row (editing vs voiding), README pointers.

## 11. Estimate

- Backend (service + routes + migration + tests): ~1 session.
- Frontend (editor component, 2 entry points, admin page, tests): ~1–2
  sessions.
- Docs/rollout: small.

## 12. Open decisions

- D2–D7 defaults above stand unless the user overrides before implementation.
- Optional later: lock editing once the event is settled / frozen (not v1).