/**
 * Tests for SellerDetailPage — contact card, items table, and action buttons.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { ADMIN_TOKEN } from '../mocks/tokens'
import { setToken } from '../api/client'
import { SellerDetailPage } from './SellerDetailPage'

const seller = {
  id: 1, code: '001', first_name: 'Jane', last_name: 'Smith',
  company: null, is_vendor: false, phone: '612-555-0101', email: 'jane@example.com',
  address: '123 Main St', city: 'Minneapolis', state: 'MN', zip: '55401',
  donate_unsold_default: false, donate_proceeds_default: false,
  event_id: 1, created_at: '2026-01-01T00:00:00Z',
}

/** Click the contact-card Edit button (distinguished from per-item "Edit item" buttons). */
function clickContactEdit() {
  const btn = screen.getAllByRole('button').find(b => b.textContent?.trim() === 'Edit')
  expect(btn).toBeDefined()
  fireEvent.click(btn!)
}

describe('SellerDetailPage', () => {
  it('renders seller contact info', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('612-555-0101')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
  })

  it('renders items table with item from API', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByText('001-01')).toBeInTheDocument())
    expect(screen.getByText('Atomic skis 160cm')).toBeInTheDocument()
  })

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn()
    render(<SellerDetailPage seller={seller} onBack={onBack} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  /** Verifies the edit form renders address fields exactly like the registration
   *  form: State as the 2-char US dropdown (pre-selected with seller's state),
   *  ZIP as 5-digit-constrained input, grouped under an Address fieldset. */
  it('renders the contact edit form like the registration form', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    clickContactEdit()
    expect(screen.getByText('Address')).toBeInTheDocument()
    expect(screen.getByLabelText('Street Address *')).toHaveValue('123 Main St')
    const stateSelect = screen.getByLabelText('State *') as HTMLSelectElement
    expect(stateSelect.tagName).toBe('SELECT')
    expect(stateSelect.value).toBe('MN')
    // Same option format as the registration dropdown.
    expect(screen.getByRole('option', { name: 'MA — Massachusetts' })).toBeInTheDocument()
    const zipInput = screen.getByLabelText('ZIP *') as HTMLInputElement
    expect(zipInput.maxLength).toBe(5)
  })

  /** Verifies saving blocks with a field error when State is cleared, and no PATCH fires. */
  it('shows an error when saving without a state', async () => {
    let patched = false
    server.use(http.patch('/sellers/1', () => {
      patched = true
      return HttpResponse.json(seller)
    }))
    setToken(ADMIN_TOKEN)
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText('State *'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/state is required/i)
    expect(patched).toBe(false)
  })

  /** Verifies non-5-digit ZIP input is corrected and a short ZIP blocks saving. */
  it('shows an error when the ZIP is not 5 digits', async () => {
    let patched = false
    server.use(http.patch('/sellers/1', () => {
      patched = true
      return HttpResponse.json(seller)
    }))
    setToken(ADMIN_TOKEN)
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    // Typing a letter is stripped; clearing leaves fewer than 5 digits.
    fireEvent.change(screen.getByLabelText('ZIP *'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/zip must be a 5-digit/i)
    expect(patched).toBe(false)
  })

  it('shows Add Item button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
  })

  it('shows Import Items button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /import items/i })).toBeInTheDocument()
  })

  it('shows Payout button in action bar', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /payout/i })).toBeInTheDocument()
  })

  it('shows payout panel when Payout button is clicked', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getAllByText('$84.00')[0]).toBeInTheDocument())
  })

  it('hides payout panel when Payout button is clicked a second time', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getAllByText('$84.00')[0]).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.queryByText('$84.00')).not.toBeInTheDocument())
  })

  /** Verifies that an Edit item button appears for each item row once items load. */
  it('shows Edit button for each item row', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByText('001-01')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /edit item/i })).toBeInTheDocument()
  })

  /** Verifies the edit panel opens with pre-filled description and price. */
  it('clicking Edit opens panel with pre-filled description and price', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit item/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit item/i }))
    expect(screen.getByDisplayValue('Atomic skis 160cm')).toBeInTheDocument()
    expect(screen.getByDisplayValue('120')).toBeInTheDocument()
  })

  /** Verifies Save calls PATCH /items/:id with the updated price and closes the panel. */
  it('clicking Save calls PATCH /items/:id with updated fields', async () => {
    let capturedBody: Record<string, unknown> | null = null
    server.use(
      http.patch('/items/:id', async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json({ id: 1, intake_id: 1, seller_id: 1, code: '001-01',
          category: 'Skis', brand: 'Atomic', type: null, description: 'Atomic skis 160cm',
          color: null, size: null, uom: null, gender_age: null, year: null,
          used: true, price: 100.0, quantity: 1, barcode_39: '001-01',
          label_line_2: null, label_line_3: null, donate_unsold: false,
          status: 'available', label_printed: false, is_deleted: false, vendor_item_id: null,
          created_at: '2026-04-04T10:00:00' })
      }),
    )
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit item/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit item/i }))
    fireEvent.change(screen.getByDisplayValue('120'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(capturedBody).toMatchObject({ price: 100 }))
    expect(screen.queryByDisplayValue('Atomic skis 160cm')).not.toBeInTheDocument()
  })

  /** Verifies Cancel closes the panel without any API call. */
  it('clicking Cancel closes panel without calling the API', async () => {
    let patchCalled = false
    server.use(http.patch('/items/:id', () => { patchCalled = true; return HttpResponse.json({}) }))
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit item/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit item/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByDisplayValue('Atomic skis 160cm')).not.toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  /** Verifies Delete in the edit panel calls DELETE /items/:id and removes the item. */
  it('Delete in edit panel calls DELETE /items/:id and removes item from list', async () => {
    server.use(http.delete('/items/:id', () => new HttpResponse(null, { status: 204 })))
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /edit item/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit item/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(screen.queryByText('001-01')).not.toBeInTheDocument())
  })
})

describe('SellerDetailPage — Import Items button (functional)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setToken(null)
  })

  it('sends an authenticated POST to /intakes/:id/items/import', async () => {
    setToken(ADMIN_TOKEN)
    let capturedRequest: Request | null = null
    server.use(
      http.post('/intakes/:intakeId/items/import', ({ request }) => {
        capturedRequest = request
        return HttpResponse.json({ imported: 1, skipped: 0, errors: [] })
      }),
    )

    const { container } = render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)

    const mockFile = new File([''], 'items.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [mockFile] } })

    await waitFor(() => expect(capturedRequest).not.toBeNull())
    expect(capturedRequest!.url).toMatch(/\/intakes\/\d+\/items\/import$/)
    expect(capturedRequest!.url).not.toContain('/api/')
    expect(capturedRequest!.headers.get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`)
  })
})
