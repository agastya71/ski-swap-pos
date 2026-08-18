/**
 * Tests for {@link ItemList} — covers item display, the delete flow (including the
 * sold-item guard that disables the button), per-item and bulk label printing,
 * the empty-state message when no items are present, and the inline edit panel.
 *
 * @module ItemList.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { ItemList } from './ItemList'
import type { Item } from '../types'

const ITEM: Item = {
  id: 1, intake_id: 5, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: 'Rossignol', type: null,
  description: 'Red skis', color: null, size: '160',
  uom: null, gender_age: null, year: null,
  used: true, price: 75, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false, is_deleted: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
}
const LABEL_PRINTED: Item = { ...ITEM, label_printed: true }

/** Tests covering the ItemList component's rendering and user interaction behaviour. */
describe('ItemList', () => {
  /** Verifies that item code, category, and formatted price are all visible in the table. */
  it('shows item code, category and price', () => {
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    expect(screen.getByText('A001-001')).toBeInTheDocument()
    expect(screen.getByText('Skis')).toBeInTheDocument()
    expect(screen.getByText('$75.00')).toBeInTheDocument()
  })

  /** Verifies that an Edit button is rendered for each item row. */
  it('shows Edit button for each item', () => {
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  /** Verifies that clicking Edit opens a panel pre-filled with the item's current values. */
  it('clicking Edit opens a panel with pre-filled description and price', () => {
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Red skis')).toBeInTheDocument()
    expect(screen.getByDisplayValue('75')).toBeInTheDocument()
  })

  /** Verifies that clicking Save issues PATCH /items/:id with the updated fields and notifies the parent. */
  it('clicking Save calls PATCH /items/:id and triggers onItemsChanged', async () => {
    let capturedBody: Record<string, unknown> | null = null
    server.use(
      http.patch('/items/:id', async ({ request }) => {
        capturedBody = await request.json() as Record<string, unknown>
        return HttpResponse.json(ITEM)
      })
    )
    const onItemsChanged = vi.fn()
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={onItemsChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('75'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(onItemsChanged).toHaveBeenCalledTimes(1))
    expect(capturedBody).toMatchObject({ price: 80 })
  })

  /** Verifies that clicking Cancel closes the panel without making an API call. */
  it('clicking Cancel closes the panel without calling the API', async () => {
    let patchCalled = false
    server.use(http.patch('/items/:id', () => { patchCalled = true; return HttpResponse.json(ITEM) }))
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByDisplayValue('Red skis')).not.toBeInTheDocument()
    expect(patchCalled).toBe(false)
  })

  /** Verifies that opening a second edit panel closes the first. */
  it('opening a second Edit panel closes the first', () => {
    const item2: Item = { ...ITEM, id: 2, code: 'A001-002', description: 'Blue boots', brand: 'Salomon' }
    render(<ItemList items={[ITEM, item2]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0])
    expect(screen.getByDisplayValue('Red skis')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[1])
    expect(screen.queryByDisplayValue('Red skis')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Blue boots')).toBeInTheDocument()
  })

  /** Verifies that clicking Delete in the edit panel calls DELETE /items/:id and notifies the parent. */
  it('Delete in edit panel calls DELETE /items/:id and triggers onItemsChanged', async () => {
    server.use(http.delete('/items/:id', () => new HttpResponse(null, { status: 204 })))
    const onItemsChanged = vi.fn()
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={onItemsChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(onItemsChanged).toHaveBeenCalledTimes(1))
  })

  /** Verifies that the Delete button inside the edit panel is disabled for printed items. */
  it('Delete button is disabled in edit panel when label is printed', () => {
    render(<ItemList items={[LABEL_PRINTED]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
  })

  /** Verifies that clicking Print Label issues a POST to /items/:id/label. */
  it('print label button calls POST /items/:id/label', async () => {
    let called = false
    server.use(http.post('/items/:id/label', () => { called = true; return new HttpResponse(null, { status: 204 }) }))
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /print label/i }))
    await waitFor(() => expect(called).toBe(true))
  })

  /** Verifies that the Print All Labels button issues a POST to /intakes/:id/labels. */
  it('shows Print All Labels button that calls POST /intakes/:id/labels', async () => {
    let called = false
    server.use(http.post('/intakes/:id/labels', () => { called = true; return new HttpResponse(null, { status: 204 }) }))
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /print all labels/i }))
    await waitFor(() => expect(called).toBe(true))
  })

  /** Verifies that the empty-state paragraph is shown when the items array is empty. */
  it('shows empty message when no items', () => {
    render(<ItemList items={[]} intakeId={5} onItemsChanged={vi.fn()} />)
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument()
  })
})

  /** Delete button is also disabled for sold items (not just printed ones). */
  it('Delete button is disabled when item has been sold', () => {
    const sold: Item = { ...ITEM, status: 'sold', quantity: 0 }
    render(<ItemList items={[sold]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
  })

  /** Quantity column shows the on-hand quantity. */
  it('shows the on-hand quantity column', () => {
    const multi = { ...ITEM, quantity: 5 }
    render(<ItemList items={[multi]} intakeId={5} onItemsChanged={vi.fn()} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  /** Adjusting quantity calls PATCH /items/:id/quantity with the signed delta. */
  it('Adjust quantity calls PATCH /items/:id/quantity and refreshes', async () => {
    let captured: { adjustment?: number } = {}
    server.use(http.patch('/items/:id/quantity', async ({ request }) => {
      captured = (await request.json()) as { adjustment?: number }
      return HttpResponse.json({ ...ITEM, quantity: 8 })
    }))
    const onItemsChanged = vi.fn()
    render(<ItemList items={[{ ...ITEM, quantity: 5 }]} intakeId={5} onItemsChanged={onItemsChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByPlaceholderText(/e.g. 3 or -2/i), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    await waitFor(() => expect(captured.adjustment).toBe(3))
    await waitFor(() => expect(onItemsChanged).toHaveBeenCalled())
  })
