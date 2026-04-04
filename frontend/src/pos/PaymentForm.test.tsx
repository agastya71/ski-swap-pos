import { render, screen, fireEvent } from '@testing-library/react'
import { PaymentForm } from './PaymentForm'

describe('PaymentForm', () => {
  it('shows total owed and cash/check/card fields', () => {
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={vi.fn()} squareToken={null} />)
    expect(screen.getByText(/\$115\.00/)).toBeInTheDocument()
    expect(screen.getByLabelText(/cash/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/check/i)).toBeInTheDocument()
  })

  it('calls onSubmit with correct payment breakdown for cash-only', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '115' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 115, check: 0, square: 0, squareToken: null })
  })

  it('calls onSubmit with split payment', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText(/check/i), { target: { value: '65' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 50, check: 65, square: 0, squareToken: null })
  })

  it('shows error when tendered total is less than owed', () => {
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={vi.fn()} squareToken={null} />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/amount tendered.*less than total/i)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<PaymentForm total={115} onSubmit={vi.fn()} onCancel={onCancel} squareToken={null} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('includes square amount and token when squareToken is provided', () => {
    const onSubmit = vi.fn()
    render(<PaymentForm total={115} onSubmit={onSubmit} onCancel={vi.fn()} squareToken="tok_abc" />)
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    expect(onSubmit).toHaveBeenCalledWith({ cash: 15, check: 0, square: 100, squareToken: 'tok_abc' })
  })
})
