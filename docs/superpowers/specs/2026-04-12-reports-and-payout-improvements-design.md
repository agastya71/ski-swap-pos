# Reports & Payout Improvements Design

## Summary

Three UI improvements to the admin module: (1) enforce a 99-character limit with a live counter on the item Description field, (2) collapse the three data-heavy report sections in ReportsPage to show only totals by default, with a Download CSV button always accessible, and (3) surface the Seller Payout report directly on each seller's list row and detail page.

No backend changes required for any feature.

---

## Feature 1 — Description Field Character Limit

### Current State

`ItemForm.tsx` has a free-text `description` input with no length constraint. Users can enter arbitrarily long strings, which overflows label fields and makes item cards unreadable.

### Target Behaviour

- The description input enforces `maxLength={99}` (less than 100 characters).
- A live character counter appears below the field: `"X / 99"`.
- When the entered text reaches 90–99 characters, the counter text turns red as a warning.
- The counter is only shown for the description field — no other `ItemForm` fields are affected.

### Components Changed

| File | Change |
|------|--------|
| `frontend/src/intake/ItemForm.tsx` | Add `maxLength={99}` to description `<input>`; render live counter below it |
| `frontend/src/intake/ItemForm.test.tsx` | Add test: typing 99 chars is allowed; typing 100 chars is blocked; counter shows correct count; counter turns red at 90+ chars |

---

## Feature 2 — Collapsible Report Sections

### Current State

`ReportsPage.tsx` renders four always-expanded sections: Event Revenue, Donations, Unsold Items, and Seller Payout. On an event with hundreds of items the page is very long and requires scrolling past large tables to reach the section you need.

### Target Behaviour

- **Event Revenue**, **Donations**, and **Unsold Items** are collapsed by default.
- **Seller Payout** is unchanged — always visible, no collapse toggle.
- Each collapsible section header row shows (left-to-right):
  - Chevron toggle (`▶` collapsed / `▼` expanded) + section title — clicking anywhere in this area toggles collapse
  - Summary value (right-aligned):
    - Event Revenue: `Gross Revenue: $X.XX`
    - Donations: `N items · $X.XX` (or `No donations` if empty)
    - Unsold Items: `N items · $X.XX` (or `No unsold items` if empty)
  - Download CSV button — always visible regardless of collapse state
- Collapse state is local React `useState` — not persisted across reloads.
- Summary values only render once data has loaded (same loading behaviour as today).

### Components Changed

| File | Change |
|------|--------|
| `frontend/src/admin/ReportsPage.tsx` | Add `useState` for collapse state of 3 sections; restructure each section header; show summary when collapsed; keep Download CSV always visible |
| `frontend/src/admin/ReportsPage.test.tsx` | Add tests: sections collapsed by default; clicking header expands; CSV button accessible while collapsed; summary values render correctly |

---

## Feature 3 — Seller Payout on Seller Records

### Current State

The Seller Payout report is only reachable via the Reports tab → Seller Payout form. To check a payout while reviewing a specific seller, the user must leave the seller view, navigate to Reports, and search again.

### Target Behaviour

- A **"Payout"** button appears on each seller row in `SellerListPage` (alongside the existing "View" button).
- A **"Payout"** button appears in the item action bar on `SellerDetailPage` (alongside "Import from Excel" and "Add Item").
- Clicking either button fetches and displays that seller's payout report via `getSellerPayout(eventId, sellerId)`.
- In `SellerListPage`: clicking "Payout" expands an inline panel directly beneath that row. Only one seller's payout can be expanded at a time — opening a second one closes the first.
- In `SellerDetailPage`: clicking "Payout" toggles a payout panel below the items table. Clicking again collapses it.
- Both surfaces render the same payout data: summary stats (Items Sold, Gross Sales, MYSL Total, Seller Payout) + line items table.
- Loading and error states are handled inside the panel.

### New Shared Component

`frontend/src/admin/SellerPayoutPanel.tsx` — accepts `{ eventId: number, sellerId: number }`, manages its own fetch/loading/error, renders the summary table and line items. Used by both `SellerListPage` and `SellerDetailPage`.

### Props Threading

`AdminPage.tsx` already has `eventId = decoded?.event_id ?? 1`. `SellerListPage` and `SellerDetailPage` currently receive no `eventId`. Both need a new `eventId: number` prop threaded from `AdminPage`.

### Components Changed

| File | Change |
|------|--------|
| `frontend/src/admin/SellerPayoutPanel.tsx` | New component — fetches + renders payout for a given seller |
| `frontend/src/admin/SellerPayoutPanel.test.tsx` | New test file — loading state, success render (summary + line items), error state |
| `frontend/src/admin/SellerListPage.tsx` | Add `eventId: number` prop; add "Payout" button per row; render `SellerPayoutPanel` inline beneath active row |
| `frontend/src/admin/SellerListPage.test.tsx` | Add tests: Payout button visible per row; click shows panel; second click on different row closes first |
| `frontend/src/admin/SellerDetailPage.tsx` | Add `eventId: number` prop; add "Payout" button in action bar; toggle `SellerPayoutPanel` below items table |
| `frontend/src/admin/SellerDetailPage.test.tsx` | Add tests: Payout button visible; click shows panel; second click hides it |
| `frontend/src/admin/AdminPage.tsx` | Pass `eventId` to `SellerListPage` and `SellerDetailPage` |

---

## Backend

No changes. All three features are purely frontend.

## Tests

All new behaviour requires functional tests (render → action → assert API call or UI state), not just existence checks.
