/**
 * Tests for {@link Cart} — covers empty-state rendering, item display (code,
 * description, price, seller code), running total calculation, and the Remove
 * button callback.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { Cart } from './Cart'
import type { ItemLookupResponse } from '../types'

const ITEM_A: ItemLookupResponse = {
  id: 1, intake_id: 1, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: null, type: null, description: 'Red skis',
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 75, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'A001',
}
const ITEM_B: ItemLookupResponse = {
  id: 2, intake_id: 1, seller_id: 2, code: 'B001-001',
  category: 'Boots', brand: null, type: null, description: 'Blue boots',
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 40, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'B001',
}

/** Tests for the Cart component covering display and interaction. */
describe('Cart', () => {
  /** Verifies an empty-state message is shown when no items are in the cart. */
  it('shows empty message when cart is empty', () => {
    render(<Cart items={[]} onRemove={vi.fn()} />)
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
  })

  /** Verifies each cart item's code, description, and price are rendered in the table. */
  it('shows each item with code, description and price', () => {
    render(<Cart items={[ITEM_A, ITEM_B]} onRemove={vi.fn()} />)
    expect(screen.getByText('A001-001')).toBeInTheDocument()
    expect(screen.getByText('Red skis')).toBeInTheDocument()
    expect(screen.getByText('$75.00')).toBeInTheDocument()
    expect(screen.getByText('B001-001')).toBeInTheDocument()
    expect(screen.getByText('$40.00')).toBeInTheDocument()
  })

  /** Verifies the running total row displays the sum of all item prices. */
  it('shows running total', () => {
    render(<Cart items={[ITEM_A, ITEM_B]} onRemove={vi.fn()} />)
    expect(screen.getByText('$115.00')).toBeInTheDocument()
  })

  /** Verifies onRemove is called with the correct item ID when the Remove button is clicked. */
  it('calls onRemove with item id when Remove is clicked', () => {
    const onRemove = vi.fn()
    render(<Cart items={[ITEM_A]} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalledWith(ITEM_A.id)
  })

  /** Verifies the seller code column is displayed for each item in the cart. */
  it('shows seller code for each item', () => {
    render(<Cart items={[ITEM_A]} onRemove={vi.fn()} />)
    expect(screen.getByText('A001')).toBeInTheDocument()
  })
})
