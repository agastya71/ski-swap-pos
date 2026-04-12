/**
 * Tests for {@link ItemForm} — covers required field validation, successful item submission
 * invoking onAdded, form reset after submission, and API error display.
 *
 * @module ItemForm.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { ItemForm } from './ItemForm'
import type { Item } from '../types'

const ITEM: Item = {
  id: 1, intake_id: 5, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: 'Rossignol', type: 'Alpine',
  description: 'Red skis', color: 'Red', size: '160',
  uom: null, gender_age: 'Adult', year: 2020,
  used: true, price: 75, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
}

/** Tests covering the ItemForm component's rendering, submission, and error handling. */
describe('ItemForm', () => {
  /** Verifies that category and price fields carry the HTML required attribute. */
  it('renders category and price fields as required', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    expect(screen.getByLabelText(/category/i)).toBeRequired()
    expect(screen.getByLabelText(/price/i)).toBeRequired()
  })

  /** Verifies that a successful submit calls onAdded with the item object returned by the API. */
  it('calls onAdded with new item after successful submit', async () => {
    server.use(http.post('/intakes/:id/items', () => HttpResponse.json(ITEM)))
    const onAdded = vi.fn()
    render(<ItemForm intakeId={5} onAdded={onAdded} />)
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Skis' } })
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(ITEM))
  })

  /** Verifies that the category select resets to its empty placeholder after a successful submit. */
  it('resets form fields after successful submit', async () => {
    server.use(http.post('/intakes/:id/items', () => HttpResponse.json(ITEM)))
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Skis' } })
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    await waitFor(() => expect((screen.getByLabelText(/category/i) as HTMLSelectElement).value).toBe(''))
  })

  /** Verifies that an API error response causes an alert with the error detail to appear. */
  it('shows error on API failure', async () => {
    server.use(http.post('/intakes/:id/items', () => HttpResponse.json({ detail: 'Labels already printed' }, { status: 409 })))
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Skis' } })
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /add item/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/labels already printed/i))
  })
})
