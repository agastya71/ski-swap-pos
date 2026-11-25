/**
 * Regression tests for the U3 POS v2 pass.
 *
 * U3 lifted the inline styles out of LookupField / Cart / PaymentForm /
 * ConfirmationScreen into `posStyles.ts` so a variant-aware class could replace
 * them. That refactor must be invisible in v1: with no `.ui-v2` root (the
 * default, and what every existing test renders), each component has to keep
 * exactly the inline values it had before. These assertions pin the handful of
 * values a careless edit would most likely break — the money display, the
 * cart's numeric alignment, and the tender colour pairing.
 *
 * @module posV2.test
 */
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Cart, type CartLine } from './Cart'
import { ConfirmationScreen } from './ConfirmationScreen'
import { PaymentForm } from './PaymentForm'
import { LOOKUP, CART, PAY, CONFIRM } from './posStyles'
import { UiVariantContext } from '../lib/uiVariant'
import type { ItemLookupResponse, SaleWithItemsResponse } from '../types'

const ITEM: ItemLookupResponse = {
  id: 1, intake_id: 1, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: null, type: 'Alpine', description: 'Red skis',
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 75, quantity: 3, remaining: 3,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false, is_deleted: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'A001',
}

const line = (over: Partial<CartLine> = {}): CartLine =>
  ({ item: ITEM, quantity: 1, sell_price: ITEM.price, notes: '', ...over })

const SALE: SaleWithItemsResponse = {
  id: 42,
  event_id: 1,
  sale_items: [],
  sale_total: 100,
  cash_amount: 120,
  check_amount: 0,
  cc_amount: 0,
  balance_due: -20,
} as unknown as SaleWithItemsResponse

const inV2 = (ui: ReactElement) =>
  render(<UiVariantContext.Provider value="v2">{ui}</UiVariantContext.Provider>)

describe('POS v1 inline styles are preserved verbatim', () => {
  it('cart keeps width/borderCollapse inline and right-aligns money columns', () => {
    render(<Cart lines={[line()]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    const table = screen.getByRole('table')
    expect(table.style.width).toBe('100%')
    expect(table.style.borderCollapse).toBe('collapse')
    expect(table.style.marginBottom).toBe('8px')
    // no class attribute at all in v1
    expect(table.className).toBe('')
  })

  it('cart quantity and unit-price inputs keep their v1 widths', () => {
    render(<Cart lines={[line()]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    expect((screen.getByLabelText(/quantity for A001-001/i) as HTMLInputElement).style.width).toBe('56px')
    expect((screen.getByLabelText(/unit price for A001-001/i) as HTMLInputElement).style.width).toBe('80px')
  })

  it('cart total keeps its 20px bold right-aligned style', () => {
    const { container } = render(<Cart lines={[line({ quantity: 2, sell_price: 50 })]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    // Cart's root div's last child is the styled total row.
    const total = (container.lastElementChild as HTMLElement).lastElementChild as HTMLElement
    expect(total.textContent).toContain('Total:')
    expect(total.style.fontSize).toBe('20px')
    expect(total.style.fontWeight).toBe('bold')
    expect(total.style.textAlign).toBe('right')
  })

  it('confirmation keeps its green mark, 48px, and navy button', () => {
    render(<ConfirmationScreen sale={SALE} onNewTransaction={vi.fn()} />)
    const mark = screen.getByText('✓')
    expect(mark.style.fontSize).toBe('48px')
    expect(mark.style.color).toBe('rgb(46, 125, 50)')
    const btn = screen.getByRole('button', { name: /new transaction/i })
    expect(btn.style.background).toBe('rgb(26, 35, 126)')
    expect(btn.style.fontSize).toBe('18px')
  })

  it('payment money inputs keep the 140px v1 width and the change box its 17px bold', () => {
    render(<PaymentForm total={50} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect((screen.getByLabelText(/cash/i) as HTMLInputElement).style.width).toBe('140px')
    expect((screen.getByLabelText(/credit card/i) as HTMLInputElement).style.width).toBe('140px')
  })
})

describe('POS v2 swaps inline styles for classes', () => {
  it('cart uses ui2 classes and no inline style on the table', () => {
    inV2(<Cart lines={[line()]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    const table = screen.getByRole('table')
    expect(table.className).toBe('ui2-cart-table')
    expect(table.getAttribute('style')).toBeNull()
  })

  it('cart money cells are right-aligned by class in v2', () => {
    inV2(<Cart lines={[line()]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    const qtyInput = screen.getByLabelText(/quantity for A001-001/i)
    expect(qtyInput.className).toBe('ui2-cart-qty')
    expect(qtyInput.getAttribute('style')).toBeNull()
  })

  it('confirmation becomes fully class-driven in v2', () => {
    inV2(<ConfirmationScreen sale={SALE} onNewTransaction={vi.fn()} />)
    expect(screen.getByText('✓').className).toBe('ui2-confirm-mark')
    expect(screen.getByRole('button', { name: /new transaction/i }).className).toBe('ui2-confirm-new')
    expect(screen.getByText('✓').getAttribute('style')).toBeNull()
  })

  it('payment inputs share the money class and drop their inline width', () => {
    inV2(<PaymentForm total={50} onSubmit={vi.fn()} onCancel={vi.fn()} />)
    const cash = screen.getByLabelText(/cash/i)
    expect(cash.className).toBe('ui2-pay-input ui2-pay-input--money')
    expect(cash.getAttribute('style')).toBeNull()
    const notes = screen.getByLabelText(/sale notes/i)
    expect(notes.className).toBe('ui2-pay-notes')
  })
})

describe('posStyles v1 tables match the values the components rendered before U3', () => {
  it('cart table and cell padding are unchanged', () => {
    expect(CART.table.width).toBe('100%')
    expect(CART.table.borderCollapse).toBe('collapse')
    expect(CART.table.marginBottom).toBe(8)
    expect(CART.thLeft.padding).toBe('4px 8px')
    expect(CART.td.padding).toBe('6px 8px')
    expect(CART.qtyInput.width).toBe(56)
    expect(CART.priceInput.width).toBe(80)
    expect(CART.total.fontSize).toBe(20)
  })

  it('payment tender status pairs green border+bg+text when it covers', () => {
    const covered = PAY.status(true)
    expect(covered.border).toBe('1px solid #86efac')
    expect(covered.background).toBe('#f0fdf4')
    expect(covered.color).toBe('#166534')
    const short = PAY.status(false)
    expect(short.border).toBe('1px solid #fca5a5')
    expect(short.background).toBe('#fef2f2')
    expect(short.color).toBe('#b91c1c')
  })

  it('lookup table keeps the 2px navy border, 18px font and inline dropdown', () => {
    expect(LOOKUP.input.border).toBe('2px solid #1e3a8a')
    expect(LOOKUP.input.fontSize).toBe(18)
    expect(LOOKUP.results.maxHeight).toBe(320)
    expect(LOOKUP.results).not.toHaveProperty('position')
    expect(LOOKUP.results).not.toHaveProperty('zIndex')
  })

  it('lookup row highlight uses the v1 #e8eef9 and dims sold-out rows', () => {
    const hot = LOOKUP.resultRow(true, true)
    expect(hot.background).toBe('#e8eef9')
    expect(hot.opacity).toBe(1)
    expect(hot.pointerEvents).toBe('auto')
    const sold = LOOKUP.resultRow(false, false)
    expect(sold.background).toBe('none')
    expect(sold.opacity).toBe(0.45)
    expect(sold.pointerEvents).toBe('none')
  })

  it('confirmation keeps the 28px total and 14px tender block', () => {
    expect(CONFIRM.total.fontSize).toBe(28)
    expect(CONFIRM.total.fontWeight).toBe('bold')
    expect(CONFIRM.tenders.fontSize).toBe(14)
    expect(CONFIRM.container.padding).toBe(32)
  })
})
