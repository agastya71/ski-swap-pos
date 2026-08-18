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
  donate_unsold: false, status: 'available', label_printed: false, is_deleted: false,
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

  /** Verifies the type field is a <select> element with ITEM_TYPES options. */
  it('renders type field as a select with equipment type options', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    const typeSelect = screen.getByLabelText(/^type$/i)
    expect(typeSelect.tagName).toBe('SELECT')
    expect(typeSelect).toContainElement(
      screen.getAllByRole('option', { name: 'Alpine Ski' })[0]
    )
    // Check for "Other" by filtering to only the type select's options
    const typeOptions = (typeSelect as HTMLSelectElement).querySelectorAll('option')
    expect(Array.from(typeOptions).some(opt => opt.textContent === 'Other')).toBe(true)
  })

  /** Verifies that selecting a type with known sizes renders size as a <select>. */
  it('renders size as a select when a type with known sizes is selected', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Alpine Ski' } })
    const sizeEl = screen.getByLabelText(/^size$/i)
    expect(sizeEl.tagName).toBe('SELECT')
    expect(sizeEl).toContainElement(screen.getByRole('option', { name: '70cm' }))
    expect(sizeEl).toContainElement(screen.getByRole('option', { name: '210cm' }))
  })

  /** Verifies that selecting "Other" keeps size as a plain text input. */
  it('renders size as a text input when type is Other', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Other' } })
    const sizeEl = screen.getByLabelText(/^size$/i)
    expect(sizeEl.tagName).toBe('INPUT')
  })

  /** Verifies that changing type resets size to empty. */
  it('resets size to empty when type changes', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Alpine Ski' } })
    fireEvent.change(screen.getByLabelText(/^size$/i), { target: { value: '160cm' } })
    expect((screen.getByLabelText(/^size$/i) as HTMLSelectElement).value).toBe('160cm')
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Helmet' } })
    expect((screen.getByLabelText(/^size$/i) as HTMLSelectElement).value).toBe('')
  })

  /** Verifies Ski Boot size options are Mondo sizing strings. */
  it('shows Mondo sizes for Ski Boot type', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: 'Ski Boot' } })
    expect(screen.getByRole('option', { name: '15.0 (Mondo)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '33.0 (Mondo)' })).toBeInTheDocument()
  })

  it('description input has maxLength of 99', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    expect(screen.getByLabelText(/description/i)).toHaveAttribute('maxlength', '99')
  })

  it('shows character counter for description field', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    expect(screen.getByText('0 / 99')).toBeInTheDocument()
  })

  it('counter updates as user types in description', () => {
    render(<ItemForm intakeId={5} onAdded={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Red skis' } })
    expect(screen.getByText('8 / 99')).toBeInTheDocument()
  })
})
