# Download Template — Top-Level Placement Design

## Summary

Move the "Download Template" button from the individual `SellerDetailPage` to the top-level `IntakeModulePage`, placing it flush-right in the tab bar row so it is always visible regardless of which tab or seller is active.

## Current State

`GET /items/import-template` is triggered by a button in `SellerDetailPage` — only reachable after navigating into a specific seller's detail view. This makes the template hard to find and unavailable when browsing the Intake tab.

## Target Behaviour

- The "Download Template" button appears in the `IntakeModulePage` tab bar row, right-aligned, at all times.
- Clicking it triggers `downloadImportTemplate()` — identical behaviour to today.
- The button is removed from `SellerDetailPage`; "Import from Excel" remains there.
- Backend role guard unchanged: `admin | intake` only.

## Layout

Tab bar row uses `justify-content: space-between`:

```
[ Intake ]  [ Sellers ]                    [ ⬇ Download Template ]
──────────────────────────────────────────────────────────────────
```

## Components Changed

| File | Change |
|------|--------|
| `frontend/src/intake/IntakeModulePage.tsx` | Add `downloadImportTemplate` import; add button flush-right in tab bar row |
| `frontend/src/admin/SellerDetailPage.tsx` | Remove "Download Template" button and `downloadImportTemplate` import |

## Backend

No changes. `GET /items/import-template` keeps its `admin | intake` role guard.

## Tests

| File | Change |
|------|--------|
| `frontend/src/intake/IntakeModulePage.test.tsx` | Add functional test: render with token → click button → assert `GET /items/import-template` with correct `Authorization` header |
| `frontend/src/admin/SellerDetailPage.test.tsx` | Remove "Download Template" functional test (button no longer in component); "Import from Excel" functional test and smoke tests unchanged |
| `frontend/src/api/items.test.ts` | No change — unit tests for `downloadImportTemplate` remain valid |
