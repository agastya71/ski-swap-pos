/**
 * Tests for {@link SellerForm} — covers field rendering, conditional required
 * fields for individual vs vendor, the US state dropdown, ZIP validation,
 * the phone-or-email client check, successful registration invoking onCreated,
 * Cancel button behaviour, and API error display.
 *
 * @module SellerForm.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { SellerForm } from './SellerForm'
import { US_STATES } from '../lib/usStates'
import type { Seller } from '../types'

const CREATED: Seller = {
  id: 2, code: 'B001', first_name: 'Bob', last_name: 'Smith',
  company: null, is_vendor: false, phone: null, email: null,
  address: null, city: null, state: null, zip: null, donate_unsold_default: false, donate_proceeds_default: false,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}

/** Fills the required contact + address fields for an individual seller. */
function fillRequiredIndividual() {
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '6125551234' } })
  fireEvent.change(screen.getByLabelText(/street address/i), { target: { value: '123 Main St' } })
  fireEvent.change(screen.getByLabelText(/^city/i), { target: { value: 'Minneapolis' } })
  fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'MN' } })
  fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: '55401' } })
}

/** Tests covering the SellerForm component's rendering and submission behaviour. */
describe('SellerForm', () => {
  /** Verifies that first name, last name, and Register button are all rendered. */
  it('renders first name, last name and submit button', () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
  })

  /** Verifies that address fields are rendered in the form. */
  it('renders address fields', () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^city/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/state/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/zip/i)).toBeInTheDocument()
  })

  /** State field is a <select> populated with US states (+ DC) and a blank option. */
  it('renders state as a select with US states', () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    const stateSelect = screen.getByLabelText(/state/i)
    expect(stateSelect.tagName).toBe('SELECT')
    const options = (stateSelect as HTMLSelectElement).options
    // blank "— select state —" + 50 states + DC
    expect(options.length).toBe(US_STATES.length + 1)
    expect((stateSelect as HTMLSelectElement).querySelector('option[value="MN"]')).not.toBeNull()
  })

  /** ZIP field enforces US 5-digit pattern and maxLength. */
  it('renders zip with 5-digit pattern and maxLength', () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    const zip = screen.getByLabelText(/zip/i) as HTMLInputElement
    expect(zip.pattern).toBe('\\d{5}')
    expect(zip.maxLength).toBe(5)
    expect(zip).toBeRequired()
  })

  /** Individual seller: first/last name required, company optional. */
  it('requires first and last name for an individual', () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/first name/i)).toBeRequired()
    expect(screen.getByLabelText(/last name/i)).toBeRequired()
    expect(screen.getByLabelText(/company/i)).not.toBeRequired()
  })

  /** Vendor: company required, first/last name not required. */
  it('requires company and not names when vendor is checked', () => {
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /vendor/i }))
    expect(screen.getByLabelText(/company/i)).toBeRequired()
    expect(screen.getByLabelText(/first name/i)).not.toBeRequired()
    expect(screen.getByLabelText(/last name/i)).not.toBeRequired()
  })

  /** Phone-or-email client check: submitting with neither shows an error and does not call the API. */
  it('blocks submit and shows error when neither phone nor email is provided', async () => {
    const onCreated = vi.fn()
    render(<SellerForm onCreated={onCreated} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
    fireEvent.change(screen.getByLabelText(/street address/i), { target: { value: '123 Main St' } })
    fireEvent.change(screen.getByLabelText(/^city/i), { target: { value: 'Minneapolis' } })
    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'MN' } })
    fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: '55401' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/phone or email/i))
    expect(onCreated).not.toHaveBeenCalled()
  })

  /** Verifies that a successful submit calls onCreated with the seller object returned by the API. */
  it('calls onCreated with new seller after successful submit', async () => {
    server.use(http.post('/sellers', () => HttpResponse.json(CREATED)))
    const onCreated = vi.fn()
    render(<SellerForm onCreated={onCreated} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
    fillRequiredIndividual()
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED))
  })

  /** Verifies that a vendor submit omits first/last name from the request body. */
  it('omits first/last name in the request body for a vendor', async () => {
    let captured: Record<string, unknown> = {}
    server.use(http.post('/sellers', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(CREATED)
    }))
    const onCreated = vi.fn()
    render(<SellerForm onCreated={onCreated} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /vendor/i }))
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: 'Pioneer Sports' } })
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '6125559999' } })
    fireEvent.change(screen.getByLabelText(/street address/i), { target: { value: '456 Industrial Blvd' } })
    fireEvent.change(screen.getByLabelText(/^city/i), { target: { value: 'Bloomington' } })
    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: 'MN' } })
    fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: '55420' } })
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(captured['is_vendor']).toBe(true)
    expect(captured['company']).toBe('Pioneer Sports')
    expect('first_name' in captured).toBe(false)
    expect('last_name' in captured).toBe(false)
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

  /** Donation-default checkboxes are included in the registration payload. */
  it('sends donation defaults in the request body when checked', async () => {
    let captured: Record<string, unknown> = {}
    server.use(http.post('/sellers', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(CREATED)
    }))
    const onCreated = vi.fn()
    render(<SellerForm onCreated={onCreated} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
    fillRequiredIndividual()
    fireEvent.click(screen.getByLabelText(/donate unsold items by default/i))
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(captured['donate_unsold_default']).toBe(true)
    expect(captured['donate_proceeds_default']).toBe(false)
  })

  /** Verifies that an API error response causes an alert with the error detail to appear. */
  it('shows API error in alert on failure', async () => {
    server.use(http.post('/sellers', () => HttpResponse.json({ detail: 'Duplicate seller code' }, { status: 400 })))
    render(<SellerForm onCreated={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Smith' } })
    fillRequiredIndividual()
    fireEvent.click(screen.getByRole('button', { name: /register/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/duplicate seller code/i))
  })
})