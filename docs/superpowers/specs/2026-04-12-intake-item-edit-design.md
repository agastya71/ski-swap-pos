# Intake Item Edit Design

## Summary

Add inline item editing to the intake item list. Clicking "Edit" on any item row expands a panel beneath that row with five commonly corrected fields (Description, Price, Brand, Size, Color) and Save / Cancel / Delete actions. No backend changes required — `PATCH /items/:id` already exists and accepts all needed fields.

---

## Feature: Edit Panel in ItemList

### Current State

`ItemList.tsx` renders a table of items in the active intake session. Each row has two actions: **Print Label** and **Delete** (delete is disabled if the label has been printed). There is no way to edit an item after it has been added.

### Target Behaviour

- Each item row has a new **"Edit"** button alongside the existing actions.
- Clicking "Edit" expands a panel directly beneath that row (same Fragment + expansion-row pattern used in `SellerListPage`).
- Only one edit panel can be open at a time — opening a second automatically closes the first.
- The panel shows five editable fields:
  - **Description** (text, max 99 chars — respects the existing limit)
  - **Price** (number, step 0.01, min 0)
  - **Brand** (text)
  - **Size** (text)
  - **Color** (text)
- The panel has three actions:
  - **Save** — calls `PATCH /items/:id` with only the changed fields; on success, updates the item in local state and closes the panel.
  - **Cancel** — closes the panel with no API call.
  - **Delete** — calls `DELETE /items/:id`; disabled if `item.label_printed` is true (existing guard). On success, removes the item from local state.
- Label-printed items remain editable (price and description corrections are valid after printing). Only deletion is blocked for printed items.
- Loading and error states are handled inside the panel: a spinner/disabled state on Save while the request is in flight; an inline error message if the PATCH fails.

### Fields NOT in the Edit Panel

Category, Type, Gender/Age, Year, Used, Donate if Unsold — these are captured at intake time and rarely need correction. They remain accessible via the original ItemForm if a new item needs to be added with different values.

---

## Components Changed

| File | Change |
|------|--------|
| `frontend/src/intake/ItemList.tsx` | Add `expandedEditId` state; "Edit" button per row; Fragment-wrapped rows; expand-below edit panel with 5 fields + Save/Cancel/Delete |
| `frontend/src/intake/ItemList.test.tsx` | Add tests: Edit button visible, panel opens on click, Save calls PATCH, Cancel closes panel, Delete calls deleteItem, second Edit click closes first |
| `frontend/src/api/items.ts` | Add `updateItem(itemId, data)` calling `PATCH /items/:id` if not already present |

---

## Backend

No changes. `PATCH /items/:id` (in `backend/app/routers/items.py`) already accepts all five fields as optional partial updates via `ItemUpdate` schema. `DELETE /items/:id` already enforces the label-printed guard with a 409 response.

---

## Tests

All new behaviour requires functional tests:

- Render `ItemList` with mock items → assert "Edit" button is present on each row.
- Click "Edit" on a row → assert the panel appears with pre-filled field values.
- Change the Price field and click "Save" → assert `PATCH /items/:id` was called with the new price.
- Click "Cancel" → assert the panel closes and no API call was made.
- Click "Edit" on row 1, then "Edit" on row 2 → assert row 1's panel closes.
- Click "Delete" in the panel for a non-printed item → assert `DELETE /items/:id` was called.
- "Delete" button is disabled for a label-printed item.
