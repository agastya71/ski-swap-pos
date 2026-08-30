/**
 * Tests for {@link PaymentForm} — covers field rendering, cash-only submission,
 * split cash/check payment, under-tender validation error, check-number and
 * card-transaction-id required validation (no server round-trip), manual card
 * entry for terminal payments, Cancel callback, and Square card token
 * integration (square amount derived automatically).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { PaymentForm } from './PaymentForm'

/** Tests for the PaymentForm component covering validation and submission behaviour. */
describe('PaymentForm', () => {
  /** Verifies the form renders the sale total and cash/check input fields. */
  it('shows total owed and cash/check/card fields', () => {
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={vi.fn()} squareToken={null} />)
    expect(screen.getByText(/\$115\.00/)).toBeInTheDocument()
    expect(screen.getByLabelText(/cash/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/check/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/card \(\$\)/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/card transaction id/i)).toBeInTheDocument()
  })

  /** Verifies onSubmit is called with the correct breakdown when the full amount is tendered in cash. */
  it('calls onSubmit with correct payment breakdown for cash-only', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '115' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 115, check: 0, square: 0, squareToken: null, checkNumber: null, cardTransactionId: null, notes: null })
  })

  /** Verifies onSubmit receives the correct split amounts when both cash and check are entered. */
  it('calls onSubmit with split payment including check number', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/check/i), { target: { value: '65' } })
    fireEvent.change(screen.getByLabelText(/check number/i), { target: { value: '1042' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 50, check: 65, square: 0, squareToken: null, checkNumber: '1042', cardTransactionId: null, notes: null })
  })

  /** Verifies a check payment without a check number is blocked client-side with a clear message. */
  it('shows error when paying by check without a check number', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/check/i), { target: { value: '115' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/check number is required/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  /** Verifies a manual card payment without a transaction id is blocked client-side. */
  it('shows error when paying by card without a transaction id', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/card \(\$\)/i), { target: { value: '115' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/card transaction id is required/i)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  /** Verifies a manual (terminal) card payment with a transaction id submits and passes the id. */
  it('submits manual card payment with transaction id', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/card \(\$\)/i), { target: { value: '115' } })
    fireEvent.change(screen.getByLabelText(/card transaction id/i), { target: { value: 'tc_9k2' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 0, check: 0, square: 115, squareToken: null, checkNumber: null, cardTransactionId: 'tc_9k2', notes: null })
  })

  /** Verifies an alert is shown when the tendered amount is less than the sale total. */
  it('shows error when tendered total is less than owed', () => {
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/amount tendered.*less than total/i)
  })

  /** Verifies the onCancel callback is invoked exactly once when the Cancel button is clicked. */
  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={onCancel} squareToken={null} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  /** Verifies the Square card amount is computed from the remaining balance and included in onSubmit when a token is present. */
  it('includes square amount and token when squareToken is provided', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken="tok_abc" />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 15, check: 0, square: 100, squareToken: 'tok_abc', checkNumber: null, cardTransactionId: null, notes: null })
  })

  /** Verifies the manual card inputs are replaced by the Square-captured notice when a token exists. */
  it('hides manual card fields when a Square token is captured', () => {
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={vi.fn()} squareToken="tok_abc" />)
    expect(screen.queryByLabelText(/card transaction id/i)).not.toBeInTheDocument()
    expect(screen.getByText(/card captured via square/i)).toBeInTheDocument()
  })
})