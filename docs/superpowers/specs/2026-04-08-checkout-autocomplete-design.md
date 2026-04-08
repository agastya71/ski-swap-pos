# Checkout Autocomplete Design

**Date:** 2026-04-08
**Status:** Approved

---

## Problem

The POS `LookupField` only fires a search when the cashier presses Enter. For keyboard entry (as opposed to barcode scanning), this requires an extra keystroke after typing a partial code. The field should show matching suggestions automatically as the user types.

## Goal

Show a live suggestion dropdown in `LookupField` as the cashier types, without requiring Enter. The existing barcode scanner fast path (Enter → exact lookup) must be fully preserved.

## Scope

**In scope:** `frontend/src/pos/LookupField.tsx` only — no backend changes required. The `/items/search?q=` endpoint already exists.

**Out of scope:** Intake item search, admin search, any other search field in the app.

---

## Behaviour Specification

### Trigger conditions

- Live search fires when `value.length >= 3`
- A 300ms debounce prevents a request on every keystroke — the search fires 300ms after the user stops typing
- Dropping below 3 characters closes the dropdown immediately

### Barcode scanner fast path — unchanged

Enter always cancels any pending debounce timer and fires `lookupItem` for an exact match, exactly as today. This path is unaffected by the autocomplete feature.

### Dropdown content

`searchItems` returns all items matching the query regardless of status. The dropdown shows all results:

- **Available items** — fully interactive: selectable by arrow key + Enter, and by click/tap
- **Non-available items** (sold, voided, donated) — shown dimmed with a status badge (e.g. "SOLD"), but inert: skipped by arrow navigation, `pointer-events: none`, `aria-disabled="true"`

Showing non-available items gives cashiers visibility that a code exists but cannot be added.

### Arrow key navigation

`highlightedIndex` (number | null) tracks which row is highlighted. Arrow keys cycle through **available items only** — non-available rows are skipped. The highlighted row gets a distinct background. Enter while a row is highlighted selects that item.

### Interaction table

| Input | Behaviour |
|---|---|
| Type 1–2 chars | Nothing |
| Type 3+ chars | 300ms debounce → `searchItems` → dropdown opens |
| Backspace below 3 chars | Dropdown closes, highlight clears |
| ArrowDown / ArrowUp | Moves highlight through available items only |
| Enter — no highlight | Cancels debounce, fires exact `lookupItem` (barcode path) |
| Enter — with highlight | Selects highlighted item, closes dropdown |
| Click / tap available row | Selects item, closes dropdown |
| Click / tap non-available row | No action |
| Escape | Closes dropdown, clears highlight |
| Item added to cart | Input clears, dropdown closes, focus returns to input |

---

## Component Design

### State additions to `LookupField`

```ts
const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

`results` already exists (`ItemLookupResponse[] | null`). No other state changes.

### Live search effect

```ts
useEffect(() => {
  if (value.trim().length < 3) {
    setResults(null)
    setHighlightedIndex(null)
    return
  }
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(async () => {
    const matches = await searchItems(value.trim())
    setResults(matches)
    setHighlightedIndex(null)
  }, 300)
  return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
}, [value])
```

### Enter key — cancel debounce before exact lookup

At the top of `handleKeyDown` for the Enter case, add:

```ts
if (debounceRef.current) clearTimeout(debounceRef.current)
```

Before proceeding with the existing `lookupItem` call. If `highlightedIndex !== null` and results exist, select the highlighted item instead of firing the lookup.

### Arrow key handling (in `handleKeyDown`)

```ts
const available = (results ?? []).map((r, i) => ({ r, i })).filter(({ r }) => r.status === 'available')

if (e.key === 'ArrowDown') {
  e.preventDefault()
  const next = available.findIndex(({ i }) => i > (highlightedIndex ?? -1))
  setHighlightedIndex(next >= 0 ? available[next].i : available[0]?.i ?? null)
}
if (e.key === 'ArrowUp') {
  e.preventDefault()
  const prev = [...available].reverse().findIndex(({ i }) => i < (highlightedIndex ?? results!.length))
  setHighlightedIndex(prev >= 0 ? [...available].reverse()[prev].i : available[available.length - 1]?.i ?? null)
}
```

### Rendering non-available rows

```tsx
<button
  key={item.id}
  onClick={item.status === 'available' ? () => handleSelectResult(item) : undefined}
  aria-disabled={item.status !== 'available'}
  style={{
    ...existingStyles,
    opacity: item.status !== 'available' ? 0.45 : 1,
    pointerEvents: item.status !== 'available' ? 'none' : 'auto',
    background: index === highlightedIndex ? '#e8eef9' : 'none',
    cursor: item.status !== 'available' ? 'default' : 'pointer',
  }}
>
```

---

## Testing

### Existing tests — all pass unchanged

All current tests use Enter-triggered lookup and are unaffected.

### New tests (added to `LookupField.test.tsx`)

| Test | Description |
|---|---|
| dropdown appears after 3 chars | `vi.useFakeTimers`, type 3 chars, advance 300ms, expect results list |
| dropdown does not appear at 2 chars | type 2 chars, advance 300ms, expect no results list |
| dropdown closes when input drops below 3 chars | open dropdown, backspace to 2 chars, expect closed |
| ArrowDown highlights first available item | open dropdown, press ArrowDown, expect first available row highlighted |
| ArrowDown skips non-available items | results include sold item first, ArrowDown highlights first available |
| Enter selects highlighted item | ArrowDown to highlight, Enter → `onFound` called |
| click selects available item | click row → `onFound` called |
| non-available item not clickable | click sold item row → `onFound` not called |
| Escape clears highlight and closes dropdown | ArrowDown then Escape → no results, no highlight |
| debounce — no request before 300ms | type 3 chars, advance 200ms, expect no search request fired |

---

## No Functional Changes Outside `LookupField`

`POSPage`, `Cart`, `PaymentForm`, and all backend code are unchanged.
