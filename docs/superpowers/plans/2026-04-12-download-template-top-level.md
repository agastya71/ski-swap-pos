# Download Template — Top-Level Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "Download Template" button from `SellerDetailPage` to the `IntakeModulePage` tab bar (flush right), making it visible at all times in the intake module.

**Architecture:** Remove the button and its import from `SellerDetailPage`. Restructure the `IntakeModulePage` tab bar row into a flex container with `justify-content: space-between` — tabs on the left, button on the right. The button calls the existing `downloadImportTemplate()` function unchanged.

**Tech Stack:** React 18, TypeScript, Vitest, MSW, Testing Library

---

## Files Changed

| File | Action |
|------|--------|
| `frontend/src/admin/SellerDetailPage.tsx` | Remove "Download Template" button; remove `downloadImportTemplate` from import |
| `frontend/src/admin/SellerDetailPage.test.tsx` | Remove "Download Template" functional test describe block |
| `frontend/src/intake/IntakeModulePage.tsx` | Add `downloadImportTemplate` import; wrap tab bar in space-between flex row with button |
| `frontend/src/intake/IntakeModulePage.test.tsx` | Add functional test: button visible, click sends auth'd GET to correct URL |

---

### Task 1: Remove Download Template from SellerDetailPage

**Files:**
- Modify: `frontend/src/admin/SellerDetailPage.test.tsx`
- Modify: `frontend/src/admin/SellerDetailPage.tsx`

- [ ] **Step 1: Remove the Download Template functional test describe block**

In `frontend/src/admin/SellerDetailPage.test.tsx`, delete the entire second describe block (the one titled `SellerDetailPage — Download Template button (functional)`). The file should end after the first describe block closes:

```tsx
/**
 * Tests for SellerDetailPage — contact card, items table, and action buttons.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { ADMIN_TOKEN } from '../mocks/tokens'
import { setToken } from '../api/client'
import { SellerDetailPage } from './SellerDetailPage'

const seller = {
  id: 1, code: '001', first_name: 'Jane', last_name: 'Smith',
  company: null, is_vendor: false, phone: '612-555-0101', email: 'jane@example.com',
  address: '123 Main St', city: 'Minneapolis', state: 'MN', zip: '55401',
  event_id: 1, created_at: '2026-01-01T00:00:00Z',
}

describe('SellerDetailPage', () => {
  it('renders seller contact info', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('612-555-0101')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
  })

  it('renders items table with item from API', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('001-01')).toBeInTheDocument())
    expect(screen.getByText('Atomic skis 160cm')).toBeInTheDocument()
  })

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn()
    render(<SellerDetailPage seller={seller} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows Add Item button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
  })

  it('shows Import from Excel button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: /import from excel/i })).toBeInTheDocument()
  })
})

describe('SellerDetailPage — Import from Excel button (functional)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setToken(null)
  })

  it('sends an authenticated POST to /intakes/:id/items/import', async () => {
    setToken(ADMIN_TOKEN)
    let capturedRequest: Request | null = null
    server.use(
      http.post('/intakes/:intakeId/items/import', ({ request }) => {
        capturedRequest = request
        return HttpResponse.json({ imported: 1, skipped: 0, errors: [] })
      }),
    )

    const { container } = render(<SellerDetailPage seller={seller} onBack={vi.fn()} />)

    const mockFile = new File([''], 'items.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [mockFile] } })

    await waitFor(() => expect(capturedRequest).not.toBeNull())
    expect(capturedRequest!.url).toMatch(/\/intakes\/\d+\/items\/import$/)
    expect(capturedRequest!.url).not.toContain('/api/')
    expect(capturedRequest!.headers.get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`)
  })
})
```

- [ ] **Step 2: Verify "Download Template" button no longer exists in SellerDetailPage**

Run:
```bash
cd frontend && npx vitest run src/admin/SellerDetailPage.test.tsx
```
Expected: all tests pass (no test currently asserts the button exists, so nothing breaks yet).

- [ ] **Step 3: Remove the button and its import from SellerDetailPage.tsx**

In `frontend/src/admin/SellerDetailPage.tsx`:

Change line 10 from:
```tsx
import { deleteItem, downloadImportTemplate } from '../api/items'
```
to:
```tsx
import { deleteItem } from '../api/items'
```

Then delete the "Download Template" `<button>` element — the one whose `onClick` calls `downloadImportTemplate()`. The surrounding JSX (keep "Import from Excel" and "Add Item" buttons):

```tsx
{/* Items table header */}
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
  <h4 style={{ margin: 0 }}>Items ({items.length})</h4>
  <div style={{ display: 'flex', gap: 8 }}>
    <button
      onClick={() => fileInputRef.current?.click()}
      style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
    >
      Import from Excel
    </button>
    <input
      ref={fileInputRef}
      type="file"
      accept=".xlsx"
      style={{ display: 'none' }}
      onChange={handleImportFile}
    />
    <button
      onClick={async () => {
        const id = await getOrCreateIntakeId()
        setAddItemIntakeId(id)
        setShowAddItem(true)
      }}
      style={{ background: NAVY, color: '#fff', border: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
    >
      Add Item
    </button>
  </div>
</div>
```

- [ ] **Step 4: Run full suite to confirm clean**

```bash
cd frontend && npx vitest run
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/admin/SellerDetailPage.tsx frontend/src/admin/SellerDetailPage.test.tsx
git commit -m "refactor: remove Download Template button from SellerDetailPage"
```

---

### Task 2: Add Download Template to IntakeModulePage

**Files:**
- Modify: `frontend/src/intake/IntakeModulePage.test.tsx`
- Modify: `frontend/src/intake/IntakeModulePage.tsx`

- [ ] **Step 1: Add failing functional test to IntakeModulePage.test.tsx**

Add these imports at the top of `frontend/src/intake/IntakeModulePage.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ADMIN_TOKEN } from '../mocks/tokens'
import { setToken } from '../api/client'
```

Then append a new describe block at the bottom of the file:

```tsx
describe('IntakeModulePage — Download Template button (functional)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setToken(null)
  })

  it('is always visible in the tab bar', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument()
  })

  it('sends an authenticated GET to /items/import-template', async () => {
    setToken(ADMIN_TOKEN)
    let capturedRequest: Request | null = null
    server.use(
      http.get('/items/import-template', ({ request }) => {
        capturedRequest = request
        return new HttpResponse(new ArrayBuffer(8), {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        })
      }),
    )

    renderPage()

    // Suppress blob URL side-effects after mount
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: /download template/i }))

    await waitFor(() => expect(capturedRequest).not.toBeNull())
    expect(capturedRequest!.url).toContain('/items/import-template')
    expect(capturedRequest!.url).not.toContain('/api/')
    expect(capturedRequest!.headers.get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`)
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd frontend && npx vitest run src/intake/IntakeModulePage.test.tsx
```
Expected: 2 new tests FAIL — `Unable to find an accessible element with the role "button" and name /download template/i`

- [ ] **Step 3: Implement in IntakeModulePage.tsx**

Full updated file:

```tsx
import { useState } from 'react'
import { IntakePage } from './IntakePage'
import { SellerListPage } from '../admin/SellerListPage'
import { SellerDetailPage } from '../admin/SellerDetailPage'
import { downloadImportTemplate } from '../api/items'
import type { Seller } from '../types'

type IntakeTab = 'intake' | 'sellers'

/**
 * Top-level intake module page — tab-based navigation between the seller intake
 * workflow and the full sellers list/detail view (accessible to admin and intake roles).
 * The Download Template button is always visible in the tab bar for quick access.
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a237e', paddingBottom: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabBtn('intake', 'Intake')}
          {tabBtn('sellers', 'Sellers')}
        </div>
        <button
          onClick={() => downloadImportTemplate()}
          style={{ border: '1px solid #1a237e', color: '#1a237e', background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
        >
          Download Template
        </button>
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

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/intake/IntakeModulePage.test.tsx
```
Expected: all 7 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd frontend && npx vitest run
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/intake/IntakeModulePage.tsx frontend/src/intake/IntakeModulePage.test.tsx
git commit -m "feat: move Download Template button to IntakeModulePage tab bar"
```

---

### Task 3: Open PR

- [ ] **Step 1: Push and open PR**

```bash
git push origin <branch>
gh pr create \
  --title "feat: move Download Template to top of intake module" \
  --body "Moves the Download Template button from the individual seller detail view to the IntakeModulePage tab bar (flush right), making it always visible regardless of which tab or seller is active. Removes it from SellerDetailPage. Backend role guard unchanged (admin | intake)."
```
