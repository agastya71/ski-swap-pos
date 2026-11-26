/**
 * Tests for {@link ReportsPage} — covers loading and display of all four report
 * sections: Event Revenue totals, Donations summary with item list, Unsold Items
 * table, and the Seller Payout lookup form (including successful payout display
 * and CSV download button presence).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UiVariantContext } from "../lib/uiVariant";
// U6 promotion: v1 is no longer the render default — these assertions are
// v1-expectation tests, so the variant is pinned explicitly.
function renderV1(ui: React.ReactElement) {
  return render(<UiVariantContext.Provider value="v1">{ui}</UiVariantContext.Provider>);
}

import { ReportsPage } from './ReportsPage'

/** ReportsPage — all report section rendering and interaction tests. */
describe('ReportsPage', () => {
  /** Verifies that the Event Revenue section loads and displays gross revenue totals in the collapsed summary. */
  it('loads and displays event revenue totals', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByText(/gross revenue/i)).toBeInTheDocument())
    expect(screen.getByText('$190.00')).toBeInTheDocument()
  })

  /** Verifies that donated items appear in the Donations section table after expanding the section. */
  it('shows donations summary with items', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Donations' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('heading', { name: 'Donations' }))
    await waitFor(() => expect(screen.getByText('A001-004')).toBeInTheDocument())
    expect(screen.getByText('Blue helmet')).toBeInTheDocument()
  })

  /** Verifies that unsold inventory items appear in the Unsold Items section table after expanding the section. */
  it('shows unsold items table', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Unsold Items' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('heading', { name: 'Unsold Items' }))
    await waitFor(() => expect(screen.getByText('A001-005')).toBeInTheDocument())
    expect(screen.getByText('Red jacket')).toBeInTheDocument()
  })

  /** Verifies that the Seller Payout section renders a combobox for seller selection. */
  it('renders seller combobox for payout lookup', () => {
    renderV1(<ReportsPage eventId={1} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  /** Verifies that selecting a seller and submitting shows the payout summary and line items table. */
  it('shows payout and line items table when seller selected', async () => {
    renderV1(<ReportsPage eventId={1} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText(/Jane Smith/))
    fireEvent.click(screen.getByText(/Jane Smith/))
    await waitFor(() => expect(screen.getByRole('button', { name: /get payout/i })).not.toBeDisabled())
    fireEvent.submit(screen.getByRole('button', { name: /get payout/i }).closest('form')!)
    await waitFor(() => expect(screen.getByText(/Jane Smith/)).toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getAllByText('Atomic skis').length).toBeGreaterThan(0),
    )
  })

  /** Verifies that CSV download buttons are rendered for each collapsible section even when collapsed. */
  it('shows CSV download buttons', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByText(/gross revenue/i))
    const csvButtons = screen.getAllByRole('button', { name: /download csv/i })
    expect(csvButtons.length).toBeGreaterThan(0)
  })
})

describe('ReportsPage — collapsible sections', () => {
  /** Verifies the Event Revenue amounts sit next to their labels: the table
   *  is shrink-to-fit, overriding the global table { width: 100% } rule
   *  (same fix as the payout summary tables, fe93c09). */
  it('keeps the event revenue amounts next to their labels', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    fireEvent.click(screen.getByRole('heading', { name: 'Event Revenue' }))
    const revenueTable = await screen.findByText('MYSL Total').then((el) => el.closest('table'))
    expect(revenueTable).toHaveStyle({ width: 'auto' })
  })

  /** Verifies that Event Revenue table rows are hidden by default and appear after clicking the header. */
  it('expands Event Revenue section when header is clicked', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    // Table body row 'MYSL Total' is not visible while collapsed
    expect(screen.queryByText('MYSL Total')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: 'Event Revenue' }))
    expect(screen.getByText('MYSL Total')).toBeInTheDocument()
  })

  /** Verifies that the three CSV buttons are accessible even when all sections are collapsed. */
  it('shows Download CSV buttons for all four sections when collapsed', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    const csvButtons = screen.getAllByRole('button', { name: /download csv/i })
    expect(csvButtons.length).toBe(4)  // revenue, donations, unsold, transactions-by-user
  })

  /** Verifies that clicking an expanded header collapses the section again. */
  it('collapses section when header is clicked a second time', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    fireEvent.click(screen.getByRole('heading', { name: 'Event Revenue' }))
    expect(screen.getByText('MYSL Total')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: 'Event Revenue' }))
    expect(screen.queryByText('MYSL Total')).not.toBeInTheDocument()
  })
})

/** Vendor Sales workbook section (legacy Retailer_Sales layout). */
describe('ReportsPage — Vendor Sales section', () => {
  /** The section renders collapsed with its XLSX download always accessible. */
  it('shows the Vendor Sales section with an XLSX download button when collapsed', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    expect(screen.getByRole('heading', { name: 'Vendor Sales' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Download vendor sales workbook xlsx' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Per-vendor workbook/i)).not.toBeInTheDocument()
  })

  /** Clicking the header expands the section to show the description. */
  it('expands Vendor Sales section when header is clicked', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Vendor Sales' }))
    fireEvent.click(screen.getByRole('heading', { name: 'Vendor Sales' }))
    expect(screen.getByText(/Consolidated per-vendor workbook/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: 'Vendor Sales' }))
    expect(screen.queryByText(/Consolidated per-vendor workbook/i)).not.toBeInTheDocument()
  })
})

describe('ReportsPage — Non-Vendor Sales section', () => {
  /** Mirrors the Vendor Sales section: collapsed by default, XLSX always accessible. */
  it('shows the Non-Vendor Sales section with an XLSX download button when collapsed', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Event Revenue' }))
    expect(screen.getByRole('heading', { name: 'Non-Vendor Sales' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Download non-vendor sales workbook xlsx' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Consolidated per-seller workbook/i)).not.toBeInTheDocument()
  })

  /** Clicking the header expands the section to show the description. */
  it('expands Non-Vendor Sales section when header is clicked', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Non-Vendor Sales' }))
    fireEvent.click(screen.getByRole('heading', { name: 'Non-Vendor Sales' }))
    expect(screen.getByText(/Consolidated per-seller workbook/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: 'Non-Vendor Sales' }))
    expect(screen.queryByText(/Consolidated per-seller workbook/i)).not.toBeInTheDocument()
  })
})

describe('ReportsPage — Check Transactions section', () => {
  /** Collapsed shows count + check total from the MSW fixture (sale #7, $120). */
  it('shows check totals in collapsed summary once loaded', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() =>
      expect(screen.getByText(/1 transaction/)).toBeInTheDocument(),
    )
  })

  /** Expanding reveals the per-transaction table with cashier, check # and amounts. */
  it('lists check transactions when expanded', async () => {
    renderV1(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByRole('heading', { name: 'Check Transactions' }))
    fireEvent.click(screen.getByRole('heading', { name: 'Check Transactions' }))
    await waitFor(() => expect(screen.getByText('#7')).toBeInTheDocument())
    expect(screen.getByText('cashier1')).toBeInTheDocument()
    expect(screen.getByText('2041')).toBeInTheDocument()
    expect(screen.getAllByText('$120.00').length).toBeGreaterThanOrEqual(2)
  })
})
