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
