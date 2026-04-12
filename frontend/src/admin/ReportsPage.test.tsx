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
  /** Verifies that the Event Revenue section loads and displays gross revenue totals. */
  it('loads and displays event revenue totals', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByText(/gross revenue/i)).toBeInTheDocument())
    expect(screen.getByText('$190.00')).toBeInTheDocument()
  })

  /** Verifies that donated items appear in the Donations section table. */
  it('shows donations summary with items', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => expect(screen.getByText('A001-004')).toBeInTheDocument())
    expect(screen.getByText('Blue helmet')).toBeInTheDocument()
  })

  /** Verifies that unsold inventory items appear in the Unsold Items section table. */
  it('shows unsold items table', async () => {
    render(<ReportsPage eventId={1} />)
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

  /** Verifies that CSV download buttons are rendered for each report section. */
  it('shows CSV download buttons', async () => {
    render(<ReportsPage eventId={1} />)
    await waitFor(() => screen.getByText(/gross revenue/i))
    const csvButtons = screen.getAllByRole('button', { name: /download csv/i })
    expect(csvButtons.length).toBeGreaterThan(0)
  })
})
