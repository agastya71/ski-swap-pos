/**
 * Tests for {@link SellerForm} — covers initial field rendering, successful registration
 * invoking onCreated, HTML5 required-field validation, Cancel button behaviour,
 * and API error display in an alert element.
 *
 * @module SellerForm.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { SellerForm } from './SellerForm'
import type { Seller } from '../types'

const CREATED: Seller = {
  id: 2, code: 'B001', first_name: 'Bob', last_name: 'Smith',
  company: null, is_vendor: false, phone: null, email: null,
  address: null, city: null, state: null, zip: null,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}

/** Tests covering the SellerForm component's rendering and submission behaviour. */
describe('SellerForm', () => {
  /** Verifies that the seller code, first name, last name, and Register button are all rendered. */
  it('renders code, first name, last name and submit button', () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/seller code/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
  })

  /** Verifies that a successful submit calls onCreated with the seller object returned by the API. */
  it('calls onCreated with new seller after successful submit', async () => {
    server.use(http.post('/sellers', () => HttpResponse.json(CREATED)))
    const onCreated = vi.fn()
    render(<SellerForm onCreated={onCreated} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/seller code/i), { target: { value: 'B001' } })
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED))
  })

  /** Verifies that the first name field carries the HTML required attribute, blocking submission. */
  it('shows error when first name is missing', async () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    expect(screen.getByLabelText(/first name/i)).toBeRequired()
  })

  /** Verifies that clicking Cancel calls the onCancel callback exactly once. */
  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<SellerForm onCreated={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  /** Verifies that an API error response causes an alert with the error detail to appear. */
  it('shows API error in alert on failure', async () => {
    server.use(http.post('/sellers', () => HttpResponse.json({ detail: 'Duplicate seller code' }, { status: 400 })))
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/seller code/i), { target: { value: 'B001' } })
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/duplicate seller code/i))
  })
})
