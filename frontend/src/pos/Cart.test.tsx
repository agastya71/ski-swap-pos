/**
 * Tests for {@link Cart} — covers empty-state, line display, editable quantity
 * (capped at remaining), price override + adjustment notes, running total, and
 * the Remove callback.
 *
 * @module Cart.test
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Cart, type CartLine } from './Cart'
import type { ItemLookupResponse } from '../types'

const ITEM_A: ItemLookupResponse = {
  id: 1, intake_id: 1, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: null, type: null, description: 'Red skis',
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 75, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false, is_deleted: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'A001',
}
const ITEM_B: ItemLookupResponse = {
  id: 2, intake_id: 1, seller_id: 2, code: 'B001-001',
  category: 'Boots', brand: null, type: null, description: 'Blue boots',
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 40, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false, is_deleted: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'B001',
}

const line = (item: ItemLookupResponse, qty = 1, sellPrice = item.price, notes = ''): CartLine =>
  ({ item, quantity: qty, sell_price: sellPrice, notes })

describe('Cart', () => {
  it('shows empty message when cart is empty', () => {
    render(<Cart lines={[]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
  })

  it('shows each item with code, description and line total', () => {
    render(<Cart lines={[line(ITEM_A), line(ITEM_B)]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('A001-001')).toBeInTheDocument()
    expect(screen.getByText('Red skis')).toBeInTheDocument()
    expect(screen.getByText('$75.00')).toBeInTheDocument()
    expect(screen.getByText('B001-001')).toBeInTheDocument()
    expect(screen.getByText('$40.00')).toBeInTheDocument()
  })

  it('shows running total', () => {
    render(<Cart lines={[line(ITEM_A), line(ITEM_B)]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('$115.00')).toBeInTheDocument()
  })

  it('calls onRemove with item id when Remove is clicked', () => {
    const onRemove = vi.fn()
    render(<Cart lines={[line(ITEM_A)]} onUpdate={vi.fn()} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove A001-001/i }))
    expect(onRemove).toHaveBeenCalledWith(ITEM_A.id)
  })

  it('shows seller code for each item', () => {
    render(<Cart lines={[line(ITEM_A)]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('A001')).toBeInTheDocument()
  })

  it('quantity input is capped at the item remaining quantity', () => {
    const multi = { ...ITEM_A, quantity: 5 }
    const onUpdate = vi.fn()
    render(<Cart lines={[line(multi, 1)]} onUpdate={onUpdate} onRemove={vi.fn()} />)
    const qtyInput = screen.getByLabelText(/quantity for A001-001/i) as HTMLInputElement
    expect(qtyInput.max).toBe('5')
    fireEvent.change(qtyInput, { target: { value: '99' } })
    expect(onUpdate).toHaveBeenCalledWith(ITEM_A.id, { quantity: 5 })
  })

  it('changing price calls onUpdate and reveals adjustment notes field', () => {
    const Wrapper = () => {
      const [lines, setLines] = useState<CartLine[]>([line(ITEM_A)])
      return <Cart lines={lines} onUpdate={(id, patch) => setLines(prev => prev.map(l => l.item.id === id ? { ...l, ...patch } : l))} onRemove={vi.fn()} />
    }
    render(<Wrapper />)
    const priceInput = screen.getByLabelText(/unit price for A001-001/i) as HTMLInputElement
    fireEvent.change(priceInput, { target: { value: '60' } })
    // notes field appears because the line price no longer matches the listed price
    expect(screen.getByLabelText(/price adjustment notes for A001-001/i)).toBeInTheDocument()
  })
})