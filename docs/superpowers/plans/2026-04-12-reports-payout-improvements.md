# Reports & Payout Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a character counter + limit to the item description field, collapse the three bulk-data report sections in ReportsPage, and surface the seller payout report directly on each seller's list row and detail page.

**Architecture:** All changes are purely frontend. Tasks are independent and ordered from simplest to most complex. A new `SellerPayoutPanel` component is extracted so the payout display is written once and reused in both `SellerListPage` and `SellerDetailPage`. `eventId` is threaded from `AdminPage` through a refactored `SellersSection` to both seller components.

**Tech Stack:** React 18, TypeScript, Vitest, MSW, Testing Library

---

## Files Changed

| File | Action |
|------|--------|
| `frontend/src/intake/ItemForm.tsx` | Add `maxLength={99}` + live counter to description field |
| `frontend/src/intake/ItemForm.test.tsx` | Add 3 tests: maxLength attr, counter display, counter update |
| `frontend/src/admin/ReportsPage.tsx` | Add collapse state; restructure Event Revenue, Donations, Unsold Items headers |
| `frontend/src/admin/ReportsPage.test.tsx` | Update 2 tests that need expand; add 3 collapse/expand tests |
| `frontend/src/admin/SellerPayoutPanel.tsx` | New component — fetches + renders payout for a seller |
| `frontend/src/admin/SellerPayoutPanel.test.tsx` | New — loading, success (summary + line items), error |
| `frontend/src/admin/AdminPage.tsx` | Thread `eventId` through `SellersSection` to both seller pages |
| `frontend/src/admin/SellerListPage.tsx` | Add `eventId` prop, Payout button per row, inline payout panel |
| `frontend/src/admin/SellerListPage.test.tsx` | Add Payout button + panel tests; update renders to pass `eventId` |
| `frontend/src/admin/SellerDetailPage.tsx` | Add `eventId` prop, Payout button in action bar, toggle payout panel |
| `frontend/src/admin/SellerDetailPage.test.tsx` | Add Payout button + panel tests; update renders to pass `eventId` |

---

### Task 1: Description field character limit

**Files:**
- Modify: `frontend/src/intake/ItemForm.tsx`
- Modify: `frontend/src/intake/ItemForm.test.tsx`

- [ ] **Step 1: Add failing tests**

Add these three tests to the end of the `describe('ItemForm', ...)` block in `frontend/src/intake/ItemForm.test.tsx`:

```tsx
  it('description input has maxLength of 99', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    expect(screen.getByLabelText(/description/i)).toHaveAttribute('maxlength', '99')
  })

  it('shows character counter for description field', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    expect(screen.getByText('0 / 99')).toBeInTheDocument()
  })

  it('counter updates as user types in description', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Red skis' } })
    expect(screen.getByText('8 / 99')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd frontend && npx vitest run src/intake/ItemForm.test.tsx
```

Expected: 3 new tests FAIL. All existing tests pass.

- [ ] **Step 3: Implement in ItemForm.tsx**

In `frontend/src/intake/ItemForm.tsx`, replace line 99:
```tsx
        {text('description', 'Description')}
```

with:
```tsx
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="description" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Description</label>
          <input
            id="description"
            value={f.description}
            onChange={e => set('description', e.target.value)}
            maxLength={99}
            style={{ width: '100%', padding: 5, boxSizing: 'border-box' }}
          />
          <div style={{ textAlign: 'right', fontSize: 11, color: f.description.length >= 90 ? '#ef4444' : '#94a3b8', marginTop: 2 }}>
            {f.description.length} / 99
          </div>
        </div>
```

- [ ] **Step 4: Run to confirm tests pass**

```bash
cd frontend && npx vitest run src/intake/ItemForm.test.tsx
```

Expected: all tests pass (including the 3 new ones).

- [ ] **Step 5: Run full suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/intake/ItemForm.tsx frontend/src/intake/ItemForm.test.tsx
git commit -m "feat: description field character limit (99) with live counter"
```

---

### Task 2: Collapsible report sections

**Files:**
- Modify: `frontend/src/admin/ReportsPage.tsx`
- Modify: `frontend/src/admin/ReportsPage.test.tsx`

- [ ] **Step 1: Update two failing tests and add three new tests**

Replace `frontend/src/admin/ReportsPage.test.tsx` with the following (the two tests that expand tables are updated; three new tests are added at the end):

```tsx
/**
 * Tests for {@link ReportsPage} — covers loading and display of all four report
 * sections: Event Revenue totals, Donations summary with item list, Unsold Items
 * table, and the Seller Payout lookup form (including successful payout display
 * and CSV download button presence).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReportsPage } from './ReportsPage'

/** ReportsPage — all report section rendering and interaction tests. */
describe('ReportsPage', () => {
  /** Verifies that the Event Revenue section loads and displays gross revenue totals in the collapsed summary. */
  it('loads and displays event revenue totals', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByText(/gross revenue/i)).toBeInTheDocument())
    expect(screen.getByText('$190.00')).toBeInTheDocument()
  })

  /** Verifies that donated items appear in the Donations section table after expanding the section. */
  it('shows donations summary with items', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Donations' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('heading', { name: 'Donations' }))
    await waitFor(() => expect(screen.getByText('A001-004')).toBeInTheDocument())
    expect(screen.getByText('Blue helmet')).toBeInTheDocument()
  })

  /** Verifies that unsold inventory items appear in the Unsold Items section table after expanding the section. */
  it('shows unsold items table', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Unsold Items' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('heading', { name: 'Unsold Items' }))
    await waitFor(() => expect(screen.getByText('A001-005')).toBeInTheDocument())
    expect(screen.getByText('Red jacket')).toBeInTheDocument()
  })

  /** Verifies that the Seller Payout section renders a combobox for seller selection. */
  it('renders seller combobox for payout lookup', () => {
    render(<ReportsPage eventId={1} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  /** Verifies that selecting a seller and submitting shows the payout summary and line items table. */
  it('shows payout and line items table when seller selected', async () => {
    render(<ReportsPage eventId={1} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByText(/Jane Smith/))
    await waitFor(() => expect(screen.getByRole('button', { name: /get payout/i })).not.toBeDisabled())
    fireEvent.submit(screen.getByRole('button', { name: /get payout/i }).closest('form')!)
    await waitFor(() => expect(screen.getByText(/Jane Smith/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Atomic skis')).toBeInTheDocument())
  })

  /** Verifies that CSV download buttons are rendered for each collapsible section even when collapsed. */
  it('shows CSV download buttons', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByText(/gross revenue/i))
    const csvButtons = screen.getAllByRole('button', { name: /download csv/i })
    expect(csvButtons.length).toBeGreaterThan(0)
  })
})

describe('ReportsPage — collapsible sections', () => {
  /** Verifies that Event Revenue table rows are hidden by default and appear after clicking the header. */
  it('expands Event Revenue section when header is clicked', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    // Table body row 'MYSL Total' is not visible while collapsed
    expect(screen.queryByText('MYSL Total')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: 'Event Revenue' }))
    expect(screen.getByText('MYSL Total')).toBeInTheDocument()
  })

  /** Verifies that the three CSV buttons are accessible even when all sections are collapsed. */
  it('shows Download CSV buttons for all three sections when collapsed', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    const csvButtons = screen.getAllByRole('button', { name: /download csv/i })
    expect(csvButtons.length).toBe(3)
  })

  /** Verifies that clicking an expanded header collapses the section again. */
  it('collapses section when header is clicked a second time', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    fireEvent.click(screen.getByRole('heading', { name: 'Event Revenue' }))
    expect(screen.getByText('MYSL Total')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: 'Event Revenue' }))
    expect(screen.queryByText('MYSL Total')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd frontend && npx vitest run src/admin/ReportsPage.test.tsx
```

Expected: the 3 new collapse/expand tests FAIL. The 2 updated "donations" and "unsold" tests also FAIL (sections not yet collapsible). The remaining 4 tests pass.

- [ ] **Step 3: Implement collapsible sections in ReportsPage.tsx**

Replace `frontend/src/admin/ReportsPage.tsx` with:

```tsx
/**
 * Admin reports page — aggregates and displays four end-of-event reports:
 * Event Revenue, Donations, Unsold Items, and per-Seller Payout. The first
 * three sections are collapsed by default showing only totals; clicking the
 * section heading expands the full table. Download CSV is always accessible.
 * Seller Payout section remains always visible with an ID-based lookup form.
 */

import { useState, useEffect, type ReactNode, type FormEvent } from 'react'
import { getEventRevenue, getDonations, getUnsoldItems, getSellerPayout, downloadFile } from '../api/reports'
import type { EventRevenueReport, DonationsReport, UnsoldItemsReport, SellerPayoutReport, Seller } from '../types'
import { SellerCombobox } from '../components/SellerCombobox'

export function ReportsPage({ eventId }: { eventId: number }) {
  const [revenue, setRevenue] = useState<EventRevenueReport | null>(null)
  const [donations, setDonations] = useState<DonationsReport | null>(null)
  const [unsold, setUnsold] = useState<UnsoldItemsReport | null>(null)
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  const [payout, setPayout] = useState<SellerPayoutReport | null>(null)
  const [payoutError, setPayoutError] = useState<string | null>(null)
  const [open, setOpen] = useState({ revenue: false, donations: false, unsold: false })

  useEffect(() => {
    Promise.all([
      getEventRevenue(eventId).then(setRevenue),
      getDonations(eventId).then(setDonations),
      getUnsoldItems(eventId).then(setUnsold),
    ]).catch(() => {})
  }, [eventId])

  function toggle(key: 'revenue' | 'donations' | 'unsold') {
    setOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handlePayoutLookup(e: FormEvent) {
    e.preventDefault()
    if (!selectedSeller) return
    setPayoutError(null)
    setPayout(null)
    try {
      const data = await getSellerPayout(eventId, selectedSeller.id)
      setPayout(data)
    } catch (err) {
      setPayoutError(err instanceof Error ? err.message : 'Failed to load payout')
    }
  }

  const sectionHeader = (
    key: 'revenue' | 'donations' | 'unsold',
    title: string,
    summary: ReactNode,
    csvFile: string,
    csvName: string,
  ) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open[key] ? 12 : 0 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}
        onClick={() => toggle(key)}
      >
        <span style={{ color: '#1a237e', fontSize: 11, userSelect: 'none' }}>{open[key] ? '▼' : '▶'}</span>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {!open[key] && summary && (
          <span style={{ color: '#64748b', fontSize: 13 }}>{summary}</span>
        )}
      </div>
      <button
        onClick={() => downloadFile(csvFile, csvName)}
        style={{ border: '1px solid #1a237e', color: '#1a237e', background: 'none', padding: '3px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
      >
        Download CSV
      </button>
    </div>
  )

  return (
    <div>
      {/* Event Revenue */}
      <section style={{ marginBottom: 32 }}>
        {sectionHeader(
          'revenue',
          'Event Revenue',
          revenue && <>Gross Revenue: <strong>${revenue.gross_revenue.toFixed(2)}</strong></>,
          `/reports/${eventId}/revenue?format=csv`,
          'event-revenue.csv',
        )}
        {open.revenue && revenue && (
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Gross Revenue', `$${revenue.gross_revenue.toFixed(2)}`],
                ['MYSL Total', `$${revenue.mysl_total.toFixed(2)}`],
                ['Seller Total', `$${revenue.seller_total.toFixed(2)}`],
                ['Transactions', String(revenue.total_sales)],
                ['Cash', `$${revenue.cash_total.toFixed(2)}`],
                ['Check', `$${revenue.check_total.toFixed(2)}`],
                ['Card (Square)', `$${revenue.cc_total.toFixed(2)}`],
              ].map(([label, val]) => (
                <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 16px 4px 8px', fontWeight: 'bold' }}>{label}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Donations */}
      <section style={{ marginBottom: 32 }}>
        {sectionHeader(
          'donations',
          'Donations',
          donations && (
            donations.total_items > 0
              ? <>{donations.total_items} items · <strong>${donations.total_value.toFixed(2)}</strong></>
              : <>No donations</>
          ),
          `/reports/${eventId}/donations?format=csv`,
          'donations.csv',
        )}
        {open.donations && donations && (
          <>
            <p>Total donated items: <strong>{donations.total_items}</strong> (value: ${donations.total_value.toFixed(2)})</p>
            {donations.items.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ccc' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Seller</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Item Code</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Price</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {donations.items.map(item => (
                    <tr key={`${item.seller_code}-${item.item_code}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 8px' }}>{item.seller_code}</td>
                      <td style={{ padding: '4px 8px' }}>{item.item_code}</td>
                      <td style={{ padding: '4px 8px' }}>{item.description ?? '—'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                      <td style={{ padding: '4px 8px' }}>{item.donation_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* Unsold Items */}
      <section style={{ marginBottom: 32 }}>
        {sectionHeader(
          'unsold',
          'Unsold Items',
          unsold && (
            unsold.total_items > 0
              ? <>{unsold.total_items} items · <strong>${unsold.total_value.toFixed(2)}</strong></>
              : <>No unsold items</>
          ),
          `/reports/${eventId}/unsold?format=csv`,
          'unsold-items.csv',
        )}
        {open.unsold && unsold && (
          <>
            {unsold.items.length === 0 && <p>No unsold items.</p>}
            {unsold.items.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ccc' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Seller</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Category</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {unsold.items.map(item => (
                    <tr key={`${item.seller_code}-${item.item_code}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 8px' }}>{item.seller_code}</td>
                      <td style={{ padding: '4px 8px' }}>{item.item_code}</td>
                      <td style={{ padding: '4px 8px' }}>{item.description ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{item.category ?? '—'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* Seller Payout Lookup */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Seller Payout</h3>
          {payout && (
            <button onClick={() => downloadFile(`/reports/${eventId}/seller/${payout.seller_id}?format=csv`, `payout-${payout.seller_code}.csv`)}>
              Download CSV
            </button>
          )}
        </div>
        <form onSubmit={handlePayoutLookup} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Seller</label>
            <SellerCombobox onSelect={setSelectedSeller} placeholder="Search by name or code..." />
          </div>
          <button type="submit" disabled={!selectedSeller}>Get Payout</button>
        </form>
        {payoutError && <div role="alert" style={{ color: 'red' }}>{payoutError}</div>}
        {payout && (
          <div>
            <p><strong>{payout.seller_name}</strong> ({payout.seller_code})</p>
            <table style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Items Sold', String(payout.items_sold)],
                  ['Gross Sales', `$${payout.gross_sales.toFixed(2)}`],
                  ['MYSL Total', `$${payout.mysl_total.toFixed(2)}`],
                  ['Seller Payout', `$${payout.seller_total.toFixed(2)}`],
                ].map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '4px 16px 4px 8px', fontWeight: 'bold' }}>{label}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payout.line_items.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ccc' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Item Code</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Ask Price</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Sold Price</th>
                  </tr>
                </thead>
                <tbody>
                  {payout.line_items.map(li => (
                    <tr key={li.item_code} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 8px' }}>{li.item_code}</td>
                      <td style={{ padding: '4px 8px' }}>{li.description ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{li.status}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>${li.price.toFixed(2)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                        {li.status === 'sold' ? `$${li.sell_price.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/admin/ReportsPage.test.tsx
```

Expected: all 9 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin/ReportsPage.tsx frontend/src/admin/ReportsPage.test.tsx
git commit -m "feat: collapse report sections by default with summary and always-visible CSV"
```

---

### Task 3: SellerPayoutPanel component

**Files:**
- Create: `frontend/src/admin/SellerPayoutPanel.tsx`
- Create: `frontend/src/admin/SellerPayoutPanel.test.tsx`

The MSW default handler for `GET /reports/:eventId/seller/:sellerId` already returns:
```json
{
  seller_name: "Jane Smith", seller_code: "001", seller_id: 1,
  items_sold: 1, gross_sales: 120.0, mysl_total: 36.0, seller_total: 84.0,
  line_items: [
    { item_code: "001-01", description: "Atomic skis", price: 120.0, sell_price: 120.0, status: "sold" },
    { item_code: "001-02", description: "Boots", price: 40.0, sell_price: 0.0, status: "unsold" }
  ]
}
```

- [ ] **Step 1: Write failing tests**

Create `frontend/src/admin/SellerPayoutPanel.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { SellerPayoutPanel } from './SellerPayoutPanel'

describe('SellerPayoutPanel', () => {
  it('shows loading state initially', () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />)
    expect(screen.getByText(/loading payout/i)).toBeInTheDocument()
  })

  it('renders payout summary after data loads', async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />)
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    expect(screen.getByText('Items Sold')).toBeInTheDocument()
    expect(screen.getByText('Gross Sales')).toBeInTheDocument()
    expect(screen.getByText('Seller Payout')).toBeInTheDocument()
    expect(screen.getByText('$84.00')).toBeInTheDocument()
  })

  it('renders line items after data loads', async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />)
    await waitFor(() => expect(screen.getByText('Atomic skis')).toBeInTheDocument())
    expect(screen.getByText('Boots')).toBeInTheDocument()
    expect(screen.getByText('001-01')).toBeInTheDocument()
  })

  it('shows error message when API fails', async () => {
    server.use(
      http.get('/reports/:eventId/seller/:sellerId', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 })
      )
    )
    render(<SellerPayoutPanel eventId={1} sellerId={1} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd frontend && npx vitest run src/admin/SellerPayoutPanel.test.tsx
```

Expected: all 4 tests FAIL — `Cannot find module './SellerPayoutPanel'`.

- [ ] **Step 3: Create SellerPayoutPanel.tsx**

Create `frontend/src/admin/SellerPayoutPanel.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { getSellerPayout } from '../api/reports'
import type { SellerPayoutReport } from '../types'

/**
 * Fetches and displays the payout report for a single seller.
 * Manages its own loading and error state.
 *
 * @param props.eventId - ID of the event to report on.
 * @param props.sellerId - ID of the seller whose payout to display.
 */
export function SellerPayoutPanel({ eventId, sellerId }: { eventId: number; sellerId: number }) {
  const [payout, setPayout] = useState<SellerPayoutReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getSellerPayout(eventId, sellerId)
      .then(setPayout)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load payout'))
      .finally(() => setLoading(false))
  }, [eventId, sellerId])

  if (loading) return <p style={{ color: '#64748b', fontSize: 13 }}>Loading payout…</p>
  if (error) return <p role="alert" style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>
  if (!payout) return null

  return (
    <div>
      <table style={{ borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          {[
            ['Items Sold', String(payout.items_sold)],
            ['Gross Sales', `$${payout.gross_sales.toFixed(2)}`],
            ['MYSL Total', `$${payout.mysl_total.toFixed(2)}`],
            ['Seller Payout', `$${payout.seller_total.toFixed(2)}`],
          ].map(([label, val]) => (
            <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 16px 4px 8px', fontWeight: 'bold', fontSize: 13 }}>{label}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 13 }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {payout.line_items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc' }}>
              {['Item Code', 'Description', 'Status', 'Ask Price', 'Sold Price'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payout.line_items.map(li => (
              <tr key={li.item_code} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px', fontSize: 12 }}>{li.item_code}</td>
                <td style={{ padding: '4px 8px', fontSize: 12 }}>{li.description ?? '—'}</td>
                <td style={{ padding: '4px 8px', fontSize: 12 }}>{li.status}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12 }}>${li.price.toFixed(2)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12 }}>
                  {li.status === 'sold' ? `$${li.sell_price.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/admin/SellerPayoutPanel.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin/SellerPayoutPanel.tsx frontend/src/admin/SellerPayoutPanel.test.tsx
git commit -m "feat: SellerPayoutPanel shared component"
```

---

### Task 4: Seller payout on seller records

**Files:**
- Modify: `frontend/src/admin/AdminPage.tsx`
- Modify: `frontend/src/admin/SellerListPage.tsx`
- Modify: `frontend/src/admin/SellerListPage.test.tsx`
- Modify: `frontend/src/admin/SellerDetailPage.tsx`
- Modify: `frontend/src/admin/SellerDetailPage.test.tsx`

**Context:** `AdminPage.tsx` derives `eventId = decoded?.event_id ?? 1`. Currently `SellersSection` (an internal component that manages list↔detail navigation) does not receive `eventId`. We thread it down so both `SellerListPage` and `SellerDetailPage` can show payout data.

- [ ] **Step 1: Add failing tests to SellerListPage.test.tsx**

Replace `frontend/src/admin/SellerListPage.test.tsx` with:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SellerListPage } from './SellerListPage'

describe('SellerListPage', () => {
  it('renders seller list', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByText('Jane Smith')).toBeInTheDocument())
    expect(screen.getByText('001')).toBeInTheDocument()
  })

  it('renders search input with helpful label', () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })

  it('calls onSelectSeller when View is clicked', async () => {
    const onSelectSeller = vi.fn()
    render(<SellerListPage onSelectSeller={onSelectSeller} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(onSelectSeller).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('renders Register New Seller button', () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /register new seller/i })).toBeInTheDocument()
  })

  it('shows Payout button for each seller row', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    expect(screen.getByRole('button', { name: /payout/i })).toBeInTheDocument()
  })

  it('shows payout panel when Payout is clicked', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getByText('$84.00')).toBeInTheDocument())
  })

  it('hides payout panel when Payout is clicked a second time', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getByText('$84.00')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.queryByText('$84.00')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Add failing tests to SellerDetailPage.test.tsx**

The existing tests all need `eventId={1}` added to each `render(...)` call, and two new tests added at the end. Replace `frontend/src/admin/SellerDetailPage.test.tsx` with:

```tsx
/**
 * Tests for SellerDetailPage — contact card, items table, and action buttons.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
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
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('612-555-0101')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
  })

  it('renders items table with item from API', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByText('001-01')).toBeInTheDocument())
    expect(screen.getByText('Atomic skis 160cm')).toBeInTheDocument()
  })

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn()
    render(<SellerDetailPage seller={seller} onBack={onBack} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows Add Item button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
  })

  it('shows Import from Excel button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /import from excel/i })).toBeInTheDocument()
  })

  it('shows Payout button in action bar', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /payout/i })).toBeInTheDocument()
  })

  it('shows payout panel when Payout button is clicked', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getByText('$84.00')).toBeInTheDocument())
  })

  it('hides payout panel when Payout button is clicked a second time', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getByText('$84.00')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.queryByText('$84.00')).not.toBeInTheDocument())
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

    const { container } = render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)

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

- [ ] **Step 3: Run to confirm new tests fail**

```bash
cd frontend && npx vitest run src/admin/SellerListPage.test.tsx src/admin/SellerDetailPage.test.tsx
```

Expected: tests that use `eventId` prop FAIL (TypeScript error: prop missing). New Payout tests also FAIL.

- [ ] **Step 4: Thread eventId through AdminPage.tsx**

Replace the `SellersSection` component in `frontend/src/admin/AdminPage.tsx` and its usage:

Change lines 22–28 from:
```tsx
/** SellersSection manages its own list↔detail navigation state. */
function SellersSection() {
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  if (selectedSeller) {
    return <SellerDetailPage seller={selectedSeller} onBack={() => setSelectedSeller(null)} />
  }
  return <SellerListPage onSelectSeller={setSelectedSeller} />
}
```

to:
```tsx
/** SellersSection manages its own list↔detail navigation state. */
function SellersSection({ eventId }: { eventId: number }) {
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  if (selectedSeller) {
    return <SellerDetailPage seller={selectedSeller} onBack={() => setSelectedSeller(null)} eventId={eventId} />
  }
  return <SellerListPage onSelectSeller={setSelectedSeller} eventId={eventId} />
}
```

Change line 62 from:
```tsx
      {section === 'sellers' && <SellersSection />}
```
to:
```tsx
      {section === 'sellers' && <SellersSection eventId={eventId} />}
```

- [ ] **Step 5: Implement payout in SellerListPage.tsx**

Replace `frontend/src/admin/SellerListPage.tsx` with:

```tsx
import { useState, useEffect, Fragment } from 'react'
import { searchSellers } from '../api/sellers'
import { SellerForm } from '../intake/SellerForm'
import { SellerPayoutPanel } from './SellerPayoutPanel'
import type { Seller } from '../types'

const NAVY = '#1e3a8a'

/**
 * Admin seller list page — debounced search, tabular display, drill-in navigation.
 * Each row has View (navigate to detail) and Payout (inline payout panel) actions.
 */
export function SellerListPage({ onSelectSeller, eventId }: {
  onSelectSeller: (seller: Seller) => void
  eventId: number
}) {
  const [query, setQuery] = useState('')
  const [sellers, setSellers] = useState<Seller[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [expandedPayoutId, setExpandedPayoutId] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      searchSellers(query).then(setSellers).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function handleCreated(seller: Seller) {
    setShowCreate(false)
    setSellers(prev => [...prev, seller].sort((a, b) => a.code.localeCompare(b.code)))
  }

  if (showCreate) {
    return <SellerForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Sellers</h3>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: NAVY, color: '#fff', border: 'none', padding: '6px 14px', cursor: 'pointer', borderRadius: 4 }}
        >
          Register New Seller
        </button>
      </div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by name or code..."
        style={{ width: '100%', padding: '8px 10px', marginBottom: 12, border: `1px solid ${NAVY}`, borderRadius: 4, boxSizing: 'border-box' }}
      />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            {['Code', 'Name', 'Phone', 'Email', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sellers.map(s => (
            <Fragment key={s.id}>
              <tr style={{ borderBottom: expandedPayoutId === s.id ? 'none' : '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: NAVY }}>{s.code}</td>
                <td style={{ padding: '8px 10px' }}>{s.first_name} {s.last_name}{s.company ? ` (${s.company})` : ''}</td>
                <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.phone ?? '—'}</td>
                <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.email ?? '—'}</td>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => onSelectSeller(s)}
                      style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '3px 10px', cursor: 'pointer', borderRadius: 3 }}
                    >
                      View →
                    </button>
                    <button
                      onClick={() => setExpandedPayoutId(prev => prev === s.id ? null : s.id)}
                      style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '3px 10px', cursor: 'pointer', borderRadius: 3 }}
                    >
                      Payout
                    </button>
                  </div>
                </td>
              </tr>
              {expandedPayoutId === s.id && (
                <tr>
                  <td colSpan={5} style={{ padding: '8px 16px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Seller Payout</strong>
                    <SellerPayoutPanel eventId={eventId} sellerId={s.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {sellers.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No sellers found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 6: Implement payout in SellerDetailPage.tsx**

Add `eventId` prop and `showPayout` state, add Payout button to action bar, and show payout panel below items table. Replace `frontend/src/admin/SellerDetailPage.tsx` with:

```tsx
/**
 * Admin seller detail page — contact card with inline edit, items table,
 * Add Item form, Excel import, and inline payout panel.
 *
 * @module SellerDetailPage
 */
import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { updateSeller, listSellerItems } from '../api/sellers'
import { getSellerIntakes, createIntake, importItems } from '../api/intakes'
import { deleteItem } from '../api/items'
import { ItemForm } from '../intake/ItemForm'
import { SellerPayoutPanel } from './SellerPayoutPanel'
import type { Seller, Item, Intake, ImportResult } from '../types'

const NAVY = '#1e3a8a'

export function SellerDetailPage({ seller: initialSeller, onBack, eventId }: {
  seller: Seller
  onBack: () => void
  eventId: number
}) {
  const [seller, setSeller] = useState<Seller>(initialSeller)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Seller>(initialSeller)
  const [items, setItems] = useState<Item[]>([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [addItemIntakeId, setAddItemIntakeId] = useState<number | null>(null)
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showPayout, setShowPayout] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listSellerItems(seller.id).then(setItems).catch(() => {})
    getSellerIntakes(seller.id).then(setIntakes).catch(() => {})
  }, [seller.id])

  async function handleSaveEdit() {
    try {
      const updated = await updateSeller(seller.id, {
        first_name: editDraft.first_name,
        last_name: editDraft.last_name,
        company: editDraft.company ?? undefined,
        phone: editDraft.phone ?? undefined,
        email: editDraft.email ?? undefined,
        address: editDraft.address ?? undefined,
        city: editDraft.city ?? undefined,
        state: editDraft.state ?? undefined,
        zip: editDraft.zip ?? undefined,
      })
      setSeller(updated)
      setEditing(false)
    } catch {
      // keep editing open so the user can retry
    }
  }

  async function handleDeleteItem(itemId: number) {
    try {
      await deleteItem(itemId)
      setItems(prev => prev.filter(i => i.id !== itemId))
    } catch {
      // deletion failed — leave item in list
    }
  }

  async function getOrCreateIntakeId(): Promise<number> {
    if (intakes.length > 0) return intakes[0].id
    const intake = await createIntake({ seller_id: seller.id })
    setIntakes([intake])
    return intake.id
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const intakeId = await getOrCreateIntakeId()
    const result = await importItems(intakeId, file)
    setImportResult(result)
    if (result.imported > 0) {
      listSellerItems(seller.id).then(setItems).catch(() => {})
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const contactField = (label: string, value: string | null) => (
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: '#64748b', fontSize: 13, marginRight: 6 }}>{label}:</span>
      <span>{value ?? '—'}</span>
    </div>
  )

  return (
    <div>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{ border: 'none', background: 'none', color: NAVY, cursor: 'pointer', fontSize: 14 }}
          aria-label="Back"
        >
          ← Back
        </button>
        <h3 style={{ margin: 0 }}>
          <span style={{ color: NAVY, marginRight: 8 }}>{seller.code}</span>
          {seller.first_name} {seller.last_name}
          {seller.company && (
            <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8 }}>({seller.company})</span>
          )}
        </h3>
      </div>

      {/* Contact card */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 16, marginBottom: 20 }}>
        {!editing ? (
          <>
            {contactField('Phone', seller.phone)}
            {contactField('Email', seller.email)}
            {contactField(
              'Address',
              seller.address
                ? `${seller.address}, ${seller.city ?? ''} ${seller.state ?? ''} ${seller.zip ?? ''}`.trim()
                : null,
            )}
            <button
              onClick={() => { setEditDraft(seller); setEditing(true) }}
              style={{ marginTop: 8, border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 12px', cursor: 'pointer', borderRadius: 3 }}
            >
              Edit
            </button>
          </>
        ) : (
          <div>
            {(['first_name', 'last_name', 'phone', 'email', 'address', 'city', 'state', 'zip'] as const).map(f => (
              <div key={f} style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>
                  {f.replace('_', ' ')}
                </label>
                <input
                  value={(editDraft[f] as string) ?? ''}
                  onChange={e => setEditDraft(prev => ({ ...prev, [f]: e.target.value }))}
                  style={{ width: '100%', padding: '5px 8px', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={handleSaveEdit}
                style={{ background: NAVY, color: '#fff', border: 'none', padding: '5px 14px', cursor: 'pointer', borderRadius: 3 }}
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{ border: '1px solid #94a3b8', background: 'none', padding: '5px 14px', cursor: 'pointer', borderRadius: 3 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

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
            onClick={() => setShowPayout(prev => !prev)}
            style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
          >
            Payout
          </button>
          <button
            onClick={async () => {
              const id = await getOrCreateIntakeId()
              setAddItemIntakeId(id)
              setShowAddItem(true)
            }}
            style={{ background: NAVY, color: '#fff', border: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div style={{
          background: importResult.skipped > 0 ? '#fef3c7' : '#f0fdf4',
          border: '1px solid',
          borderColor: importResult.skipped > 0 ? '#fcd34d' : '#86efac',
          borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 13,
        }}>
          Imported {importResult.imported} item{importResult.imported !== 1 ? 's' : ''}.
          {importResult.skipped > 0 && (
            ` Skipped ${importResult.skipped} row${importResult.skipped !== 1 ? 's' : ''}: ${importResult.errors.map(e => `row ${e.row}: ${e.reason}`).join('; ')}`
          )}
          <button
            onClick={() => setImportResult(null)}
            style={{ marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Add Item inline form */}
      {showAddItem && addItemIntakeId !== null && (
        <div style={{ marginBottom: 16, padding: 16, border: '1px solid #e2e8f0', borderRadius: 6 }}>
          <button
            onClick={() => { setShowAddItem(false); setAddItemIntakeId(null) }}
            style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            ✕ Cancel
          </button>
          <ItemForm
            intakeId={addItemIntakeId}
            onAdded={item => { setItems(prev => [...prev, item]); setShowAddItem(false); setAddItemIntakeId(null) }}
          />
        </div>
      )}

      {/* Items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            {['Code', 'Description', 'Category', 'Price', 'Status', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '7px 8px', fontFamily: 'monospace', color: NAVY }}>{item.code}</td>
              <td style={{ padding: '7px 8px' }}>{item.description ?? '—'}</td>
              <td style={{ padding: '7px 8px', color: '#64748b' }}>{item.category ?? '—'}</td>
              <td style={{ padding: '7px 8px' }}>${item.price.toFixed(2)}</td>
              <td style={{ padding: '7px 8px' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  color: item.status === 'sold' ? '#16a34a' : '#64748b',
                }}>
                  {item.status}
                </span>
              </td>
              <td style={{ padding: '7px 8px' }}>
                {!item.label_printed && item.status === 'available' && (
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                No items yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Payout panel */}
      {showPayout && (
        <div style={{ marginTop: 16, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
          <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Seller Payout</strong>
          <SellerPayoutPanel eventId={eventId} sellerId={seller.id} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/admin/SellerListPage.test.tsx src/admin/SellerDetailPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 8: Run full suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/admin/AdminPage.tsx \
        frontend/src/admin/SellerListPage.tsx frontend/src/admin/SellerListPage.test.tsx \
        frontend/src/admin/SellerDetailPage.tsx frontend/src/admin/SellerDetailPage.test.tsx
git commit -m "feat: seller payout button on list and detail pages"
```

---

### Task 5: Open PR

- [ ] **Step 1: Push and open PR**

```bash
git push origin <branch>
gh pr create \
  --title "feat: description limit, collapsible reports, seller payout on records" \
  --body "Three UI improvements: (1) item description capped at 99 chars with live counter; (2) Event Revenue, Donations, and Unsold Items sections collapse by default showing totals, with Download CSV always accessible; (3) Payout button on each seller row and on the seller detail page shows inline payout panel. No backend changes."
```
