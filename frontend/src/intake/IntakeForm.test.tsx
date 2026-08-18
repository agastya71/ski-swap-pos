/**
 * Tests for {@link IntakeForm} — covers initial render (seller name and checkboxes),
 * successful form submission invoking the onCreated callback, and API error display.
 *
 * @module IntakeForm.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { IntakeForm } from './IntakeForm'
import type { Seller, Intake } from '../types'

const SELLER: Seller = {
  id: 1, code: 'A001', first_name: 'Jane', last_name: 'Doe',
  company: null, is_vendor: false, phone: null, email: null,
  address: null, city: null, state: null, zip: null, donate_unsold_default: false, donate_proceeds_default: false,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}
const INTAKE: Intake = {
  id: 5, seller_id: 1, date_entered: '2026-04-04', date_received: null,
  donate_proceeds: false, donate_unsold: true,
  total: 0, mysl_total: 0, seller_total: 0, created_at: '2026-04-04T10:00:00',
}

/** Tests covering the IntakeForm component's rendering and submission behaviour. */
describe('IntakeForm', () => {
  /** Verifies that the seller name heading and both donation preference checkboxes are rendered. */
  it('shows seller name and donation preference checkboxes', () => {
    render(<IntakeForm seller={SELLER} onCreated={vi.fn()} />)
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByLabelText(/donate proceeds/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/donate unsold/i)).toBeInTheDocument()
  })

  /** Verifies that submitting the form calls onCreated with the intake returned by the API. */
  it('calls onCreated with the new intake on submit', async () => {
    server.use(http.post('/intakes', () => HttpResponse.json(INTAKE)))
    const onCreated = vi.fn()
    render(<IntakeForm seller={SELLER} onCreated={onCreated} />)
    fireEvent.click(screen.getByLabelText(/donate unsold/i))
    fireEvent.click(screen.getByRole('button', { name: /start intake/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(INTAKE))
  })

  /** Verifies that an API error response causes an alert with the error detail to appear. */
  it('shows error on API failure', async () => {
    server.use(http.post('/intakes', () => HttpResponse.json({ detail: 'No active event' }, { status: 503 })))
    render(<IntakeForm seller={SELLER} onCreated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /start intake/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no active event/i))
  })

  /** Donation checkboxes pre-fill from the seller's per-seller defaults. */
  it('pre-fills donation checkboxes from seller defaults', () => {
    const sellerWithDefaults: Seller = { ...SELLER, donate_unsold_default: true, donate_proceeds_default: true }
    render(<IntakeForm seller={sellerWithDefaults} onCreated={vi.fn()} />)
    expect((screen.getByLabelText(/donate unsold/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/donate proceeds/i) as HTMLInputElement).checked).toBe(true)
  })

  /** Changing the seller re-seeds the checkboxes from the new seller's defaults. */
  it('re-seeds checkboxes when seller changes', () => {
    const { rerender } = render(<IntakeForm seller={SELLER} onCreated={vi.fn()} />)
    expect((screen.getByLabelText(/donate unsold/i) as HTMLInputElement).checked).toBe(false)
    rerender(<IntakeForm seller={{ ...SELLER, id: 2, code: 'A002', donate_unsold_default: true }} onCreated={vi.fn()} />)
    expect((screen.getByLabelText(/donate unsold/i) as HTMLInputElement).checked).toBe(true)
  })
})
