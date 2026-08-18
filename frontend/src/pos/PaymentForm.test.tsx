/**
 * Tests for {@link PaymentForm} — covers field rendering, cash-only submission,
 * split cash/check payment, under-tender validation error, Cancel callback,
 * and Square card token integration (square amount derived automatically).
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
  })

  /** Verifies onSubmit is called with the correct breakdown when the full amount is tendered in cash. */
  it('calls onSubmit with correct payment breakdown for cash-only', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '115' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 115, check: 0, square: 0, squareToken: null, checkNumber: null, notes: null })
  })

  /** Verifies onSubmit receives the correct split amounts when both cash and check are entered. */
  it('calls onSubmit with split payment', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/check/i), { target: { value: '65' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 50, check: 65, square: 0, squareToken: null, checkNumber: null, notes: null })
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
    expect(onSubmit).toHaveBeenCalledWith({ cash: 15, check: 0, square: 100, squareToken: 'tok_abc', checkNumber: null, notes: null })
  })
})
