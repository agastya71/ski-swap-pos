# Improvements Plan — 2026-09-18

> Six workstreams from the 2026-09-18 request, phased for execution.
> Status: **EXECUTING** — Q2–Q7 resolved 2026-09-18; **Q1 (label specifics) still OPEN, Phase F parked** until answered.
> Resolved: A2 role name = `cashier_intake` (cashier+intake abilities, nothing admin) · A3 item codes = 5-digit numeric starting **10000**, sequential, auto-assigned at intake, unique per event DB, seller codes stay alphanumeric, existing items grandfathered (no renumber — 83 of 102 live items have printed labels that would be invalidated) · A4 = (a) payout reports + (b) My Transactions · A5 = per-vendor on demand, grouped by `item.category` · A6 = shared user-account registry; existing swap.db becomes the TEST SWAP POS 2026 event DB; storage `backend/events/<name>.db` · A7 = rename now.
> Each phase = one feature branch → PR → (user approval) → merge → gates re-run on main.
> Deploy conventions: frontend-only = `npm run build` (live immediately); backend = one
> `sudo systemctl restart ski-swap-pos` (user runs sudo).

---

## §0 Open questions (must be answered before the corresponding phase starts)

| # | Question | Status |
|---|----------|--------|
| Q1 | **Label refinement specifics** — current layout: price (top-left, 30pt) · Code 128 barcode of the item code (top-right) + human-readable code under it · event name centered below · seller code · description (30 chars) · 2 optional free-text lines; one label per on-hand unit. What exactly should change (fields added/removed, sizes, positions, barcode type)? A reference photo of a desired label is ideal. | ⏸ OPEN — Phase F parked |
| Q2 | **Combined role name** — resolved: `cashier_intake`; cashier+intake abilities, nothing admin-only. | ✅ 2026-09-18 |
| Q3 | **Numeric item IDs** — resolved: 5-digit numeric starting 10000, sequential upward (10000, 10001, …), auto-assigned at intake, unique per event DB; seller codes stay alphanumeric; existing items grandfathered (renumbering would invalidate 83 printed labels). | ✅ 2026-09-18 |
| Q4 | **Price-adjustment reason surfaces** — resolved: (a) seller payout reports' SALES tables (all formats + per-seller ZIP) + (b) My Transactions expanded lines. No dedicated event-wide report. | ✅ 2026-09-18 |
| Q5 | **Vendor summary by equipment type** — resolved: admin generates per vendor on demand; group by `item.category` (start here). | ✅ 2026-09-18 |
| Q6 | **Per-event DB design** — resolved: shared user-account registry (accounts work across events; no re-login on switch); existing `backend/swap.db` becomes the TEST SWAP POS 2026 event DB; storage `backend/events/<name>.db`. | ✅ 2026-09-18 |
| Q7 | **Event rename timing** — resolved: rename NOW (Phase A). | ✅ 2026-09-18 |

---

## Current state (grounded in code)

- Single DB `backend/swap.db`: event id 1 **"Ski Swap 2026"** (active), 102 items
  (codes like `EJOH11`…`SUMM16` — seller prefix + seq), 26 sales, 11 users
  (3 admin / 7 cashier / 1 intake), 3 vendors (NORD1, SUMM1, POWD1).
- Roles are plain strings gated by `require_roles(...)` per router
  (sales: admin+cashier · intakes/items/sellers: admin+intake · reports/users/events/admin: admin).
- Item codes: `codes.py` = name-derived seller code + seq (`JSMI11`). POS lookup is exact
  match on `item.code`; labels print a Code 128 of `barcode_39 or code`.
- Price-adjustment reason = `sale_item.notes` (set from the Cart's "Reason for price
  adjustment" field when the cashier overrides the unit price). It is **not** exposed in
  any report/export or in My Transactions today.
- Reports (admin-only): seller payout (single + all + ZIP), revenue, donations, unsold,
  transactions-by-user, end-of-day — formats JSON/CSV/MD/PDF/XLSX via `report_formatter`.
- Events: `Event` table with `is_active` flag; `EventSetup.tsx` admin UI can create and
  activate events (single-DB model). `backend/scripts/prepare_event_db.py` (PR #98, in
  flight) already builds a fresh empty DB + active event + bootstrap admin per event day.
- `seed_demo.py` seeds the alphanumeric codes and the "Ski Swap 2026" event; idempotent.

---

## Phases

### Phase A — Rename the active event to "TEST SWAP POS 2026" (quick win)
- One `UPDATE event SET name=…` on the live DB (safe while the daemon runs) **or** part of
  Phase G — per Q7.
- `seed_demo.py` + tests referencing "Ski Swap 2026" updated to the new name.
- Effort: trivial. No schema change.

### Phase B — Combined cashier/intake role
- New role value (per Q2) accepted wherever `"cashier"`/`"intake"` are accepted:
  `users.py` create-user validation; guards in `sales.py`, `intakes.py`, `items.py`,
  `sellers.py` (add the new role to each non-admin guard); `users.py` model comment.
- Frontend: `UserManagement.tsx` Role union + dropdown option; Layout nav shows both
  POS and Intake tabs for the new role.
- `seed_demo.py`: optionally add a combined-role demo account.
- Tests: role-gate matrix (new role allowed on cashier+intake routes, 403 on admin-only).

### Phase C — Numeric-only item IDs
- `codes.py`: replace item-code generation with numeric-only, sequential, unique within
  the event DB (per Q3 — likely just sequential integers; no seller prefix).
- Intake creation, bulk import (`item_import.py`), and POS lookup unchanged in behavior
  (lookup is already an exact string match — numeric codes are just strings).
- Labels: numeric Code 128 barcodes (shorter than today's). `barcode_39` stays safe.
- `seed_demo.py`: generate numeric item codes (+ idempotency keys updated).
- Old items grandfathered (no migration), per user statement + Q3.
- Tests: `test_codes.py`, `test_items.py`, import tests, label tests.

### Phase D — Expose price-adjustment reason
- `SellerPayoutSaleLine.price_adjustment_reason` (from `sale_item.notes`); SALES tables in
  `report_formatter` gain a "Price Adj. Reason" column (JSON/CSV/MD/PDF/XLSX + ZIP exports).
- My Transactions (POSPage expanded lines): show the reason on lines whose sell price
  differs from the item's listed price.
- Optionally a dedicated event-wide adjustments report (per Q4).
- Tests: report service + formatter snapshots + POSPage render test.

### Phase E — Vendor summary report by equipment type
- New admin report `GET /reports/{event_id}/vendor/{seller_id}` (or `/vendors-summary`):
  per equipment type (Q5) — units sold, gross sales, MYSL share, vendor payout, unsold
  remaining — plus totals. Formats via `report_formatter` (CSV/PDF/XLSX included).
- Admin UI: a per-vendor summary view (likely on the seller detail/payout page).
- "Vendors only" scoping: report refuses non-vendor sellers (422) per the user's intent.
- Tests: service + router + UI panel.

### Phase F — Label printing refinement [HIGH]
- Blocked on Q1 answers. Changes land in `zpl.py` + `config.py` label constants + tests;
  every geometry change verified against the ZD421 (user visually confirms a live print).

### Phase G — Per-event databases + admin-controlled active event
- Architecture (per Q6a): each event = separate SQLite file with the SAME schema
  (`backend/events/<slug>.db`), schema at alembic head; a small master registry (file or
  registry DB) holds the active-event pointer; admin endpoint `POST /events/{id}/activate`
  switches it for ALL users (cashiers/intake/combined included) — the app rebinds its
  engine to the active event's DB.
- `prepare_event_db.py` (PR #98) extended: create + register a new event DB instead of
  replacing the single DB (backup-before-create retained).
- `EventSetup.tsx`: create event (→ new DB file), set active (→ engine switch), show
  which DB each event maps to.
- `start.sh` / `config.py`: DATABASE_URL handling for the active-event DB; migrations
  applied per event DB; backups cover `backend/events/*`.
- Existing data migration path decided by Q6b.
- Runbook § update; tests for switch-on-the-fly + bootstrap/lockout guards.

---

## Execution conventions (every phase)

1. Feature branch `feat/<phase-slug>` → implement + tests (backend `pytest -q`, frontend
   `npm test` + `npx tsc -b`) → PR → user approval → merge → pull main → re-run gates.
2. Backend-deployed phases need one daemon restart (user runs sudo); frontend-only phases
   just `npm run build`.
3. Plan doc updated as phases complete; STATUS.md + cerebrum/buglog kept fresh.

## Suggested order

A (rename) → B (role) → C (numeric IDs) → D (adjustment reason) → E (vendor report) →
G (per-event DBs last — biggest, benefits from earlier phases) — with **F (labels, HIGH)**
jumping the queue the moment Q1 is answered.