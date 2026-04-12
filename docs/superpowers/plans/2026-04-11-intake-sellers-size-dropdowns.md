# Intake Seller List & Size Dropdowns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sellers tab to the intake view (mirroring the admin Sellers tab) and replace the free-text `type`/`size` fields in `ItemForm` with linked dropdowns driven by equipment type.

**Architecture:** A new `IntakeModulePage` wraps the existing `IntakePage` in a two-tab shell (Intake + Sellers) and reuses `SellerListPage`/`SellerDetailPage` unchanged. A static `src/lib/itemSizes.ts` config drives a `<select>` for `type` and a conditional select-or-text-input for `size` in `ItemForm`. No backend changes.

**Tech Stack:** React 18, TypeScript, Vitest, MSW (mock service worker), existing CSS-in-JS inline styles

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/lib/itemSizes.ts` | Create | `ITEM_TYPES` string array + `SIZE_OPTIONS` record |
| `frontend/src/lib/itemSizes.test.ts` | Create | Unit tests for size config values |
| `frontend/src/intake/ItemForm.tsx` | Modify | `type` → `<select>`; `size` → conditional select/input |
| `frontend/src/intake/ItemForm.test.tsx` | Modify | Add type/size dropdown interaction tests |
| `frontend/src/intake/IntakeModulePage.tsx` | Create | Tab wrapper (Intake + Sellers) |
| `frontend/src/intake/IntakeModulePage.test.tsx` | Create | Tab navigation tests |
| `frontend/src/App.tsx` | Modify | Swap `IntakePage` → `IntakeModulePage` on intake route |

---

## Task 1: Static size config (`src/lib/itemSizes.ts`)

**Files:**
- Create: `frontend/src/lib/itemSizes.ts`
- Create: `frontend/src/lib/itemSizes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/itemSizes.test.ts`:

```typescript
import { ITEM_TYPES, SIZE_OPTIONS } from './itemSizes'

describe('ITEM_TYPES', () => {
  it('contains all 14 equipment types', () => {
    expect(ITEM_TYPES).toHaveLength(14)
    expect(ITEM_TYPES).toContain('Alpine Ski')
    expect(ITEM_TYPES).toContain('Ski Boot')
    expect(ITEM_TYPES).toContain('Other')
  })
})

describe('SIZE_OPTIONS', () => {
  it('has no entry for Other (free-text fallback)', () => {
    expect(SIZE_OPTIONS['Other']).toBeUndefined()
  })

  it('Alpine Ski runs 70cm–210cm in 5cm steps (29 values)', () => {
    const sizes = SIZE_OPTIONS['Alpine Ski']
    expect(sizes).toHaveLength(29)
    expect(sizes[0]).toBe('70cm')
    expect(sizes[sizes.length - 1]).toBe('210cm')
  })

  it('Ski Boot runs 15.0–33.0 Mondo in 0.5 steps (37 values)', () => {
    const sizes = SIZE_OPTIONS['Ski Boot']
    expect(sizes).toHaveLength(37)
    expect(sizes[0]).toBe('15.0 (Mondo)')
    expect(sizes[sizes.length - 1]).toBe('33.0 (Mondo)')
  })

  it('Helmet has standard alpha sizes', () => {
    expect(SIZE_OPTIONS['Helmet']).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd frontend && npx vitest run src/lib/itemSizes.test.ts
```

Expected: FAIL — `Cannot find module './itemSizes'`

- [ ] **Step 3: Create `frontend/src/lib/itemSizes.ts`**

```typescript
export const ITEM_TYPES: string[] = [
  'Alpine Ski',
  'Snowboard',
  'Nordic/XC Ski',
  'Ski Boot',
  'Snowboard Boot',
  'Ski Pole',
  'Snowboard Pole',
  'Helmet',
  'Goggles',
  'Jacket',
  'Pants',
  'Base Layer',
  'Gloves',
  'Other',
]

function cmRange(start: number, end: number, step: number): string[] {
  const out: string[] = []
  for (let n = start; n <= end; n += step) out.push(`${n}cm`)
  return out
}

function mondoRange(startTenths: number, endTenths: number): string[] {
  const out: string[] = []
  for (let n = startTenths; n <= endTenths; n += 5) {
    out.push(`${(n / 10).toFixed(1)} (Mondo)`)
  }
  return out
}

export const SIZE_OPTIONS: Record<string, string[]> = {
  'Alpine Ski':     cmRange(70, 210, 5),
  'Snowboard':      cmRange(70, 175, 5),
  'Nordic/XC Ski':  cmRange(90, 215, 5),
  'Ski Pole':       cmRange(70, 140, 5),
  'Snowboard Pole': cmRange(70, 130, 5),
  'Ski Boot':       mondoRange(150, 330),
  'Snowboard Boot': Array.from({ length: 18 }, (_, i) => String(i + 1)),
  'Helmet':         ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'Goggles':        ['Youth', 'One Size', 'S', 'M', 'L'],
  'Jacket':         ['4', '6', '8', '10', '12', '14', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  'Pants':          ['4', '6', '8', '10', '12', '14', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
  'Base Layer':     ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  'Gloves':         ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd frontend && npx vitest run src/lib/itemSizes.test.ts
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/itemSizes.ts src/lib/itemSizes.test.ts
cd .. && git add frontend/src/lib/itemSizes.ts frontend/src/lib/itemSizes.test.ts
git commit -m "feat: add static item type and size options config"
```

---

## Task 2: Update ItemForm — type select + linked size field

**Files:**
- Modify: `frontend/src/intake/ItemForm.tsx`
- Modify: `frontend/src/intake/ItemForm.test.tsx`

### Background

`ItemForm.tsx` currently renders `type` and `size` as plain `<input type="text">` via the `text()` helper. The `category` field already uses a `<select>`. The `set(k, v)` helper does a generic field update.

Changes:
- Import `ITEM_TYPES` and `SIZE_OPTIONS` from `../lib/itemSizes`
- Add `handleTypeChange(newType: string)` that sets `type` AND resets `size` to `''`
- Replace `{text('type', 'Type')}` with a `<select>` over `ITEM_TYPES`
- Replace `{text('size', 'Size')}` with a conditional: `<select>` when `SIZE_OPTIONS[f.type]` exists, plain `<input>` otherwise

- [ ] **Step 1: Add tests for type select and size coupling**

Append these test cases to the existing `describe('ItemForm', ...)` block in `frontend/src/intake/ItemForm.test.tsx`:

```typescript
  /** Verifies the type field is a <select> element with ITEM_TYPES options. */
  it('renders type field as a select with equipment type options', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    const typeSelect = screen.getByLabelText(/^type$/i)
    expect(typeSelect.tagName).toBe('SELECT')
    expect(typeSelect).toContainElement(
      screen.getByRole('option', { name: 'Alpine Ski' })
    )
    expect(typeSelect).toContainElement(
      screen.getByRole('option', { name: 'Other' })
    )
  })

  /** Verifies that selecting a type with known sizes renders size as a <select>. */
  it('renders size as a select when a type with known sizes is selected', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Alpine Ski' } })
    const sizeEl = screen.getByLabelText(/^size$/i)
    expect(sizeEl.tagName).toBe('SELECT')
    expect(sizeEl).toContainElement(screen.getByRole('option', { name: '70cm' }))
    expect(sizeEl).toContainElement(screen.getByRole('option', { name: '210cm' }))
  })

  /** Verifies that selecting "Other" keeps size as a plain text input. */
  it('renders size as a text input when type is Other', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Other' } })
    const sizeEl = screen.getByLabelText(/^size$/i)
    expect(sizeEl.tagName).toBe('INPUT')
  })

  /** Verifies that changing type resets size to empty. */
  it('resets size to empty when type changes', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Alpine Ski' } })
    fireEvent.change(screen.getByLabelText(/^size$/i), { target: { value: '160cm' } })
    expect((screen.getByLabelText(/^size$/i) as HTMLSelectElement).value).toBe('160cm')
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Helmet' } })
    expect((screen.getByLabelText(/^size$/i) as HTMLSelectElement).value).toBe('')
  })

  /** Verifies Ski Boot size options are Mondo sizing strings. */
  it('shows Mondo sizes for Ski Boot type', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Ski Boot' } })
    expect(screen.getByRole('option', { name: '15.0 (Mondo)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '33.0 (Mondo)' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd frontend && npx vitest run src/intake/ItemForm.test.tsx
```

Expected: FAIL — new tests fail because `type` is still an `<input>`, not a `<select>`

- [ ] **Step 3: Update `frontend/src/intake/ItemForm.tsx`**

Replace the entire file with:

```typescript
/**
 * Item entry form — captures all fields for a single consignment item and adds it to the
 * current intake session. Item code is auto-generated by the backend.
 *
 * @module ItemForm
 */
import { useState, type FormEvent } from 'react'
import { addItem } from '../api/intakes'
import { ITEM_TYPES, SIZE_OPTIONS } from '../lib/itemSizes'
import type { Item } from '../types'

const CATEGORIES = ['Skis', 'Ski Boots', 'Ski Poles', 'Snowboard', 'Snowboard Boots', 'Bindings', 'Helmet', 'Clothing', 'Other']

const emptyForm = () => ({
  category: '', brand: '', type: '', description: '', color: '',
  size: '', uom: '', gender_age: '', year: '', used: false, price: '', donate_unsold: false,
})

/**
 * Form component for adding a single item to an intake session.
 * Validates required fields (category, price), submits via the intakes API,
 * and resets after each successful submission. Item code is auto-generated by the backend.
 *
 * @param props.intakeId - ID of the intake session to which the item will be added.
 * @param props.onAdded - Callback invoked with the newly created {@link Item} on success.
 */
export function ItemForm({ intakeId, onAdded }: {
  intakeId: number
  onAdded: (item: Item) => void
}) {
  const [f, setF] = useState(() => emptyForm())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function set(k: keyof ReturnType<typeof emptyForm>, v: string | boolean) {
    setF(prev => ({ ...prev, [k]: v }))
  }

  function handleTypeChange(newType: string) {
    setF(prev => ({ ...prev, type: newType, size: '' }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const item = await addItem(intakeId, {
        category: f.category || undefined,
        brand: f.brand || undefined,
        type: f.type || undefined,
        description: f.description || undefined,
        color: f.color || undefined,
        size: f.size || undefined,
        uom: f.uom || undefined,
        gender_age: f.gender_age || undefined,
        year: f.year ? parseInt(f.year) : undefined,
        used: f.used,
        price: parseFloat(f.price),
        donate_unsold: f.donate_unsold,
      })
      onAdded(item)
      setF(emptyForm())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setLoading(false)
    }
  }

  const text = (id: keyof ReturnType<typeof emptyForm>, label: string, required = false) => (
    <div style={{ marginBottom: 8 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>{label}</label>
      <input id={id} value={f[id] as string} onChange={e => set(id, e.target.value)} required={required} style={{ width: '100%', padding: 5, boxSizing: 'border-box' }} />
    </div>
  )

  const sizeOptions = SIZE_OPTIONS[f.type]

  return (
    <form onSubmit={handleSubmit}>
      <h4>Add Item</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="category" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Category *</label>
          <select id="category" value={f.category} onChange={e => set('category', e.target.value)} required style={{ width: '100%', padding: 5 }}>
            <option value="">— select —</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {text('brand', 'Brand')}
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="type" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Type</label>
          <select id="type" value={f.type} onChange={e => handleTypeChange(e.target.value)} style={{ width: '100%', padding: 5 }}>
            <option value="">— select type —</option>
            {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {text('description', 'Description')}
        {text('color', 'Color')}
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="size" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Size</label>
          {sizeOptions ? (
            <select id="size" value={f.size} onChange={e => set('size', e.target.value)} style={{ width: '100%', padding: 5 }}>
              <option value="">— select size —</option>
              {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input id="size" value={f.size} onChange={e => set('size', e.target.value)} style={{ width: '100%', padding: 5, boxSizing: 'border-box' }} />
          )}
        </div>
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="gender_age" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Gender/Age</label>
          <select id="gender_age" value={f.gender_age} onChange={e => set('gender_age', e.target.value)} style={{ width: '100%', padding: 5 }}>
            <option value="">— select —</option>
            {['Adult', 'Youth', 'Toddler', 'Unisex'].map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {text('year', 'Year')}
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="price" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Price *</label>
          <input id="price" type="number" min="0" step="0.01" value={f.price} onChange={e => set('price', e.target.value)} required style={{ width: '100%', padding: 5, boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ marginBottom: 10, display: 'flex', gap: 16 }}>
        <label>
          <input type="checkbox" checked={f.used} onChange={e => set('used', e.target.checked)} />
          {' '}Used item
        </label>
        <label>
          <input type="checkbox" checked={f.donate_unsold} onChange={e => set('donate_unsold', e.target.checked)} />
          {' '}Donate if unsold (override intake preference)
        </label>
      </div>
      {error && <div role="alert" style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <button type="submit" disabled={loading}>Add Item</button>
    </form>
  )
}
```

- [ ] **Step 4: Run the full ItemForm test suite to confirm all tests pass**

```bash
cd frontend && npx vitest run src/intake/ItemForm.test.tsx
```

Expected: PASS — all tests (original 3 + new 5) passing

- [ ] **Step 5: Commit**

```bash
git add frontend/src/intake/ItemForm.tsx frontend/src/intake/ItemForm.test.tsx
git commit -m "feat: type and size dropdowns in ItemForm"
```

---

## Task 3: `IntakeModulePage` — tab wrapper

**Files:**
- Create: `frontend/src/intake/IntakeModulePage.tsx`
- Create: `frontend/src/intake/IntakeModulePage.test.tsx`

### Background

`AdminPage.tsx` already implements the exact pattern to replicate: a `SellersSection` sub-component manages `selectedSeller: Seller | null` state and renders either `SellerListPage` or `SellerDetailPage` based on it. `IntakeModulePage` does the same with an additional outer tab between "Intake" and "Sellers".

`SellerDetailPage` calls two endpoints on mount:
- `GET /sellers/:id/items` — list seller items
- `GET /sellers/:id/intakes` — list seller intake sessions

Both must be mocked in tests that navigate to the detail view.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/intake/IntakeModulePage.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { AuthProvider } from '../auth/AuthContext'
import { IntakeModulePage } from './IntakeModulePage'
import type { Seller } from '../types'

const SELLER: Seller = {
  id: 1, code: '001', first_name: 'Jane', last_name: 'Doe',
  company: null, is_vendor: false, phone: '555-1234', email: 'jane@example.com',
  address: null, city: null, state: null, zip: null,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}

function renderPage() {
  render(<AuthProvider><IntakeModulePage /></AuthProvider>)
}

describe('IntakeModulePage', () => {
  /** Verifies that both tab buttons are rendered. */
  it('renders Intake and Sellers tab buttons', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /^intake$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sellers$/i })).toBeInTheDocument()
  })

  /** Verifies that the intake workflow (seller search input) is shown by default. */
  it('shows intake workflow by default', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })

  /** Verifies that the Intake tab button carries aria-current="page" by default. */
  it('marks Intake tab as active by default', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /^intake$/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /^sellers$/i })).not.toHaveAttribute('aria-current')
  })

  /** Verifies that clicking the Sellers tab shows the seller list. */
  it('shows seller list when Sellers tab is clicked', async () => {
    server.use(http.get('/sellers', () => HttpResponse.json([SELLER])))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^sellers$/i }))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^sellers$/i })).toHaveAttribute('aria-current', 'page')
  })

  /** Verifies that clicking View on a seller row shows SellerDetailPage. */
  it('shows seller detail when View is clicked', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.get('/sellers/:id/items', () => HttpResponse.json([])),
      http.get('/sellers/:id/intakes', () => HttpResponse.json([])),
    )
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^sellers$/i }))
    await waitFor(() => screen.getByText('Jane Doe'))
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    await waitFor(() => expect(screen.getByText(/jane doe/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
  })

  /** Verifies that clicking Back from detail returns to the seller list. */
  it('returns to seller list when Back is clicked', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.get('/sellers/:id/items', () => HttpResponse.json([])),
      http.get('/sellers/:id/intakes', () => HttpResponse.json([])),
    )
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^sellers$/i }))
    await waitFor(() => screen.getByText('Jane Doe'))
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    await waitFor(() => screen.getByRole('button', { name: /back/i }))
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd frontend && npx vitest run src/intake/IntakeModulePage.test.tsx
```

Expected: FAIL — `Cannot find module './IntakeModulePage'`

- [ ] **Step 3: Create `frontend/src/intake/IntakeModulePage.tsx`**

```typescript
import { useState } from 'react'
import { IntakePage } from './IntakePage'
import { SellerListPage } from '../admin/SellerListPage'
import { SellerDetailPage } from '../admin/SellerDetailPage'
import type { Seller } from '../types'

type IntakeTab = 'intake' | 'sellers'

/**
 * Top-level intake module page — tab-based navigation between the seller intake
 * workflow and the full sellers list/detail view (accessible to admin and intake roles).
 */
export function IntakeModulePage() {
  const [tab, setTab] = useState<IntakeTab>('intake')
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)

  const tabBtn = (t: IntakeTab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      aria-current={tab === t ? 'page' : undefined}
      style={{
        padding: '6px 16px',
        background: tab === t ? '#1a237e' : 'transparent',
        color: tab === t ? 'white' : '#1a237e',
        border: '1px solid #1a237e',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #1a237e', paddingBottom: 8 }}>
        {tabBtn('intake', 'Intake')}
        {tabBtn('sellers', 'Sellers')}
      </div>
      {tab === 'intake' && <IntakePage />}
      {tab === 'sellers' && (
        selectedSeller
          ? <SellerDetailPage seller={selectedSeller} onBack={() => setSelectedSeller(null)} />
          : <SellerListPage onSelectSeller={setSelectedSeller} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd frontend && npx vitest run src/intake/IntakeModulePage.test.tsx
```

Expected: PASS — all 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add frontend/src/intake/IntakeModulePage.tsx frontend/src/intake/IntakeModulePage.test.tsx
git commit -m "feat: add IntakeModulePage with Intake and Sellers tabs"
```

---

## Task 4: Wire `IntakeModulePage` into `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

### Background

`App.tsx` currently imports `IntakePage` and renders it directly on the `intake` route. This task swaps in `IntakeModulePage`. The existing IntakePage tests are unaffected — they import `IntakePage` directly. No new tests are needed here; the full test suite verifies nothing broke.

- [ ] **Step 1: Update `frontend/src/App.tsx`**

Change the import and the route render. The full updated file:

```typescript
/**
 * Root application component — mounts AuthProvider, BrowserRouter, and top-level routes
 * mapping paths to module pages.
 */
import { useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'

import { IntakeModulePage } from './intake/IntakeModulePage'
import { POSPage } from './pos/POSPage'
import { AdminPage } from './admin/AdminPage'

type Page = 'intake' | 'pos' | 'admin'

/** Returns the default landing page for a given user role. */
function defaultPage(role: string): Page {
  if (role === 'cashier') return 'pos'
  if (role === 'intake') return 'intake'
  return 'admin'
}

/**
 * Inner application shell rendered after auth context is available.
 * Shows the login page when unauthenticated, otherwise renders the
 * role-appropriate page inside the shared Layout.
 */
function AppInner() {
  const { decoded } = useAuth()
  const [page, setPage] = useState<Page | null>(null)

  if (!decoded) return <LoginPage onLogin={() => {}} />

  const activePage = page ?? defaultPage(decoded.role)

  return (
    <Layout page={activePage} onNavigate={setPage}>
      {activePage === 'intake' && (
        <ProtectedRoute roles={['admin', 'intake']}><IntakeModulePage /></ProtectedRoute>
      )}
      {activePage === 'pos' && (
        <ProtectedRoute roles={['admin', 'cashier']}><POSPage /></ProtectedRoute>
      )}
      {activePage === 'admin' && (
        <ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute>
      )}
    </Layout>
  )
}

/**
 * Top-level component that wraps the entire app in {@link AuthProvider}
 * and renders {@link AppInner}.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
```

- [ ] **Step 2: Run the full frontend test suite to confirm nothing broke**

```bash
cd frontend && npm test
```

Expected: PASS — all tests passing (existing IntakePage tests pass because they import `IntakePage` directly, not `IntakeModulePage`)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire IntakeModulePage into App intake route"
```

---

## Final Verification

- [ ] **Run complete frontend test suite one more time**

```bash
cd frontend && npm test
```

Expected: PASS — all tests passing with no failures
