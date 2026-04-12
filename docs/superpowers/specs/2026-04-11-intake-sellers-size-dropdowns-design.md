# Intake Seller List & Size Dropdowns — Design Specification

**Date:** 2026-04-11
**Status:** Approved

---

## Overview

Two independent UI improvements:

1. **Intake Seller List** — expose the same seller browsing + editing capability available in the Admin module to intake users, via a new "Sellers" tab in the intake view.
2. **Type + Size Dropdowns** — replace the free-text `type` and `size` fields in `ItemForm` with linked dropdowns: selecting an equipment type populates appropriate size options for that type.

---

## 1. Intake Seller List

### Approach

Wrap `IntakePage` in a new top-level `IntakeModulePage` that adds a tab bar with two tabs:

| Tab | Content |
|-----|---------|
| Intake | Existing `IntakePage` (unchanged) |
| Sellers | `SellerListPage` / `SellerDetailPage` (reused from admin module) |

### IntakeModulePage

- **File:** `src/intake/IntakeModulePage.tsx`
- **Role guard:** `_INTAKE_ADMIN` (covers both admin and intake roles — same guard already on the intake route)
- **State:** `activeTab: 'intake' | 'sellers'` and `selectedSeller: Seller | null`
- **Tab bar styling:** reuse existing `tab` / `tab active` CSS classes from `AdminPage`

**Tab routing:**
- "Intake" tab → renders `<IntakePage />`
- "Sellers" tab → when `selectedSeller === null` renders `<SellerListPage onSelectSeller={s => setSelectedSeller(s)} />`; when set renders `<SellerDetailPage seller={selectedSeller} onBack={() => setSelectedSeller(null)} />`

This mirrors the `AdminPage` sub-navigation pattern exactly — no new routes, no new URL segments.

### App.tsx change

One line: swap `IntakePage` for `IntakeModulePage` on the `/intake` route. `IntakePage` itself is unchanged.

### Roles & Permissions

Both admin (`ADMIN`) and intake (`INTAKE`) users can see both tabs. `SellerListPage` and `SellerDetailPage` are already guarded by `_INTAKE_ADMIN` and expose full edit/delete capabilities — intake staff can edit seller information.

### Tests

`src/intake/__tests__/IntakeModulePage.test.tsx`:
- Renders with "Intake" and "Sellers" tabs visible
- "Intake" tab active by default; `IntakePage` content renders
- Clicking "Sellers" tab shows `SellerListPage`
- Clicking a seller's "View" button shows `SellerDetailPage` for that seller
- Clicking "Back" in detail returns to list

---

## 2. Type + Size Dropdowns in ItemForm

### Approach

A static client-side config file maps equipment types to their valid sizes. `ItemForm` reads this config to drive two linked `<select>` elements. No backend changes needed — `type` and `size` are already free-text columns.

### `src/lib/itemSizes.ts`

Exports two values:

**`ITEM_TYPES: string[]`** — ordered list of selectable equipment types:
```
Alpine Ski, Snowboard, Nordic/XC Ski,
Ski Boot, Snowboard Boot,
Ski Pole, Snowboard Pole,
Helmet, Goggles,
Jacket, Pants, Base Layer, Gloves,
Other
```

**`SIZE_OPTIONS: Record<string, string[]>`** — sizes per type:

| Type | Values | Notes |
|------|--------|-------|
| Alpine Ski | 70cm – 210cm | 5cm steps (29 values) |
| Snowboard | 70cm – 175cm | 5cm steps (22 values) |
| Nordic/XC Ski | 90cm – 215cm | 5cm steps (26 values) |
| Ski Pole | 70cm – 140cm | 5cm steps (15 values) |
| Snowboard Pole | 70cm – 130cm | 5cm steps (13 values) |
| Ski Boot | 15.0 (Mondo) – 33.0 (Mondo) | 0.5 steps (37 values) |
| Snowboard Boot | 1 – 18 | US whole sizes (18 values) |
| Helmet | XS, S, M, L, XL, XXL | — |
| Goggles | Youth, One Size, S, M, L | — |
| Jacket | 4, 6, 8, 10, 12, 14, XS, S, M, L, XL, XXL, XXXL | Youth numeric + adult alpha |
| Pants | 4, 6, 8, 10, 12, 14, XS, S, M, L, XL, XXL, XXXL | Youth numeric + adult alpha |
| Base Layer | XS, S, M, L, XL, XXL | — |
| Gloves | XS, S, M, L, XL, XXL | — |

`"Other"` is **not** in `SIZE_OPTIONS` — intentional fallback to free text.

### ItemForm changes

**`type` field:** Replace `text()` helper call with a `<select>` containing a blank `"— select type —"` option followed by all `ITEM_TYPES`.

**`size` field:**
- When `SIZE_OPTIONS[formData.type]` exists → `<select>` with a blank option + the type's sizes.
- When `formData.type` is `""`, `"Other"`, or not in `SIZE_OPTIONS` → `<input type="text">` (existing behavior).

**Reset rule:** when `type` changes, `size` resets to `""`. This prevents stale values (e.g., "190cm" remaining when switching from Alpine Ski to Helmet).

The existing `select()` helper in `ItemForm` is already used for `category` — the same pattern applies to `type`. For `size`, a small inline conditional renders either the select or the input.

### Tests

Update `src/intake/__tests__/ItemForm.test.tsx`:
- `type` field is a `<select>` element
- Selecting "Alpine Ski" changes `size` field to a `<select>`
- Selecting "Other" shows `size` as a text `<input>`
- Changing type resets size to blank
- Selecting "Ski Boot" shows mondo size options

---

## Affected Files

| File | Change |
|------|--------|
| `src/intake/IntakeModulePage.tsx` | **New** — tab wrapper |
| `src/intake/__tests__/IntakeModulePage.test.tsx` | **New** — module tab tests |
| `src/App.tsx` | **Modify** — swap route target |
| `src/lib/itemSizes.ts` | **New** — ITEM_TYPES + SIZE_OPTIONS |
| `src/intake/ItemForm.tsx` | **Modify** — type select + size conditional |
| `src/intake/__tests__/ItemForm.test.tsx` | **Update** — type/size dropdown tests |

No backend changes. No new routes. No schema changes.

---

## Out of Scope

- Adding seller registration ("Register New Seller") to the intake Sellers tab — staff can already register via the intake flow
- Editing items from the intake Sellers tab — SellerDetailPage already supports this
- Custom/free-text size entry when a dropdown type is selected
- Syncing type/size dropdowns to the backend as constrained enums
