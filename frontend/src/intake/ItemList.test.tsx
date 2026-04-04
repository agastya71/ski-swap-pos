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
  donate_unsold: false, status: 'available', label_printed: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
}
const LABEL_PRINTED: Item = { ...ITEM, label_printed: true }

describe('ItemList', () => {
  it('shows item code, category and price', () => {
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    expect(screen.getByText('A001-001')).toBeInTheDocument()
    expect(screen.getByText('Skis')).toBeInTheDocument()
    expect(screen.getByText('$75.00')).toBeInTheDocument()
  })

  it('delete button calls DELETE /items/:id and triggers onItemsChanged', async () => {
    server.use(http.delete('/items/:id', () => new HttpResponse(null, { status: 204 })))
    const onItemsChanged = vi.fn()
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={onItemsChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(onItemsChanged).toHaveBeenCalledTimes(1))
  })

  it('delete button is disabled when label is printed', () => {
    render(<ItemList items={[LABEL_PRINTED]} intakeId={5} onItemsChanged={vi.fn()} />)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
  })

  it('print label button calls POST /items/:id/label', async () => {
    let called = false
    server.use(http.post('/items/:id/label', () => { called = true; return new HttpResponse(null, { status: 204 }) }))
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /print label/i }))
    await waitFor(() => expect(called).toBe(true))
  })

  it('shows Print All Labels button that calls POST /intakes/:id/labels', async () => {
    let called = false
    server.use(http.post('/intakes/:id/labels', () => { called = true; return new HttpResponse(null, { status: 204 }) }))
    render(<ItemList items={[ITEM]} intakeId={5} onItemsChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /print all labels/i }))
    await waitFor(() => expect(called).toBe(true))
  })

  it('shows empty message when no items', () => {
    render(<ItemList items={[]} intakeId={5} onItemsChanged={vi.fn()} />)
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument()
  })
})
