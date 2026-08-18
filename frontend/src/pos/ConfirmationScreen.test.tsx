/**
 * Tests for {@link ConfirmationScreen} — covers receipt display (sale ID, total,
 * item count), per-tender payment breakdown, and the 'New Transaction' callback.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmationScreen } from './ConfirmationScreen'
import type { SaleWithItemsResponse } from '../types'

const SALE: SaleWithItemsResponse = {
  id: 42, event_id: 1, date_of_sale: '2026-04-04',
  customer_name: null, customer_email: null,
  sale_total: 115, mysl_total: 34.5, seller_total: 80.5,
  cash_amount: 115, check_amount: 0, cc_amount: 0,
  check_number: null, cc_transaction_id: null, total_paid: 115, balance_due: 0,
  notes: null, is_voided: false, created_at: '2026-04-04T10:00:00',
  created_by: null,
  sale_items: [
    { id: 1, sale_id: 42, item_id: 1, line_number: null, quantity: 1, sell_price: 75, extended_price: 75, notes: null, created_at: '2026-04-04T10:00:00' },
    { id: 2, sale_id: 42, item_id: 2, line_number: null, quantity: 1, sell_price: 40, extended_price: 40, notes: null, created_at: '2026-04-04T10:00:00' },
  ],
}

/** Tests for the ConfirmationScreen component rendered with a completed sale fixture. */
describe('ConfirmationScreen', () => {
  /** Verifies the sale ID, total amount, and item count are shown on the confirmation screen. */
  it('shows sale ID, total, and number of items', () => {
    render(<ConfirmationScreen sale={SALE} onNewTransaction={vi.fn()} />)
    expect(screen.getByText(/sale #42/i)).toBeInTheDocument()
    expect(screen.getByText('$115.00')).toBeInTheDocument()
    expect(screen.getByText(/2 items/i)).toBeInTheDocument()
  })

  /** Verifies the payment breakdown section shows the cash amount tendered. */
  it('shows payment breakdown', () => {
    render(<ConfirmationScreen sale={SALE} onNewTransaction={vi.fn()} />)
    expect(screen.getByText(/cash.*\$115\.00/i)).toBeInTheDocument()
  })

  /** Verifies the onNewTransaction callback is invoked exactly once when the button is clicked. */
  it('calls onNewTransaction when New Transaction is clicked', () => {
    const onNew = vi.fn()
    render(<ConfirmationScreen sale={SALE} onNewTransaction={onNew} />)
    fireEvent.click(screen.getByRole('button', { name: /new transaction/i }))
    expect(onNew).toHaveBeenCalledTimes(1)
  })
})
