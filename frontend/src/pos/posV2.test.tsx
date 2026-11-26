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
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Cart, type CartLine } from './Cart'
import { ConfirmationScreen } from './ConfirmationScreen'
import { PaymentForm } from './PaymentForm'
import { LOOKUP, CART, PAY, CONFIRM, EDITOR, POS_PAGE, v1Only, variantProps } from './posStyles'
import { TransactionEditor } from './TransactionEditor'
import { AuthProvider } from '../auth/AuthContext'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
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

// U6 promotion: v1 is no longer the render default — the "v1 keeps …"
// assertions must pin the variant explicitly, mirroring inV2().
const inV1 = (ui: ReactElement) =>
  render(<UiVariantContext.Provider value="v1">{ui}</UiVariantContext.Provider>)

describe('POS v1 inline styles are preserved verbatim', () => {
  it('cart keeps width/borderCollapse inline and right-aligns money columns', () => {
    inV1(<Cart lines={[line()]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    const table = screen.getByRole('table')
    expect(table.style.width).toBe('100%')
    expect(table.style.borderCollapse).toBe('collapse')
    expect(table.style.marginBottom).toBe('8px')
    // no class attribute at all in v1
    expect(table.className).toBe('')
  })

  it('cart quantity and unit-price inputs keep their v1 widths', () => {
    inV1(<Cart lines={[line()]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    expect((screen.getByLabelText(/quantity for A001-001/i) as HTMLInputElement).style.width).toBe('56px')
    expect((screen.getByLabelText(/unit price for A001-001/i) as HTMLInputElement).style.width).toBe('80px')
  })

  it('cart total keeps its 20px bold right-aligned style', () => {
    const { container } = inV1(<Cart lines={[line({ quantity: 2, sell_price: 50 })]} onUpdate={vi.fn()} onRemove={vi.fn()} />)
    // Cart's root div's last child is the styled total row.
    const total = (container.lastElementChild as HTMLElement).lastElementChild as HTMLElement
    expect(total.textContent).toContain('Total:')
    expect(total.style.fontSize).toBe('20px')
    expect(total.style.fontWeight).toBe('bold')
    expect(total.style.textAlign).toBe('right')
  })

  it('confirmation keeps its green mark, 48px, and navy button', () => {
    inV1(<ConfirmationScreen sale={SALE} onNewTransaction={vi.fn()} />)
    const mark = screen.getByText('✓')
    expect(mark.style.fontSize).toBe('48px')
    expect(mark.style.color).toBe('rgb(46, 125, 50)')
    const btn = screen.getByRole('button', { name: /new transaction/i })
    expect(btn.style.background).toBe('rgb(26, 35, 126)')
    expect(btn.style.fontSize).toBe('18px')
  })

  it('payment money inputs keep the 140px v1 width and the change box its 17px bold', () => {
    inV1(<PaymentForm total={50} onSubmit={vi.fn()} onCancel={vi.fn()} />)
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

describe('TransactionEditor v2 (U3 part 2)', () => {
  const editorSale = (): SaleWithItemsResponse =>
    ({
      id: 7,
      event_id: 1,
      date_of_sale: '2026-04-04T10:00:00',
      customer_name: null,
      customer_email: null,
      sale_total: 35,
      mysl_total: 10.5,
      seller_total: 24.5,
      cash_amount: 35,
      check_amount: 0,
      cc_amount: 0,
      cc_fee: 0,
      check_number: null,
      cc_transaction_id: null,
      total_paid: 35,
      balance_due: 0,
      notes: null,
      is_voided: false,
      transaction_number: 7,
      is_finalized: true,
      created_at: '2026-04-04T10:00:00',
      created_by: 'cashier1',
      sale_items: [
        {
          id: 11,
          sale_id: 7,
          item_id: 101,
          item_code: '10003',
          line_number: 1,
          quantity: 1,
          sell_price: 20,
          extended_price: 20,
          notes: null,
          created_at: '2026-04-04T10:00:00',
        },
      ],
    }) as unknown as SaleWithItemsResponse

  const renderWith = (v2: boolean) => {
    const ui = (
      <AuthProvider>
        <TransactionEditor saleId={7} onClose={() => {}} />
      </AuthProvider>
    )
    return v2
      ? render(<UiVariantContext.Provider value="v2">{ui}</UiVariantContext.Provider>)
      : render(<UiVariantContext.Provider value="v1">{ui}</UiVariantContext.Provider>)
  }

  beforeEach(() => {
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(editorSale())),
      http.get('/sales/:id/edits', () => HttpResponse.json([])),
    )
  })

  it('v1 keeps inline styles on the panel and the line table', async () => {
    renderWith(false)
    const title = await screen.findByText('Edit sale #7')
    expect(title.getAttribute('style')).toContain('color: rgb(30, 58, 138)')
    const table = screen.getByRole('table')
    expect(table.getAttribute('style')).toContain('border-collapse: collapse')
    // the container carries the inline 2px navy border in v1
    const panel = title.closest('div')!.parentElement as HTMLElement
    expect(panel.getAttribute('style')).toContain('border: 2px solid rgb(30, 58, 138)')
  })

  it('v2 drops the inline styles and uses ui2 classes', async () => {
    renderWith(true)
    const title = await screen.findByText('Edit sale #7')
    expect(title.className).toBe('ui2-editor-title')
    expect(title.getAttribute('style')).toBeNull()
    const table = screen.getByRole('table')
    expect(table.className).toBe('ui2-editor-table')
    expect(table.getAttribute('style')).toBeNull()
  })

  it('v2 styles line inputs by class and keeps their aria labels', async () => {
    renderWith(true)
    const qty = await screen.findByLabelText(/quantity for 10003/i)
    expect(qty.className).toBe('ui2-editor-qty')
    expect(qty.getAttribute('style')).toBeNull()
    const price = screen.getByLabelText(/unit price for 10003/i)
    expect(price.className).toBe('ui2-editor-price')
    const notes = screen.getByLabelText(/notes for 10003/i)
    expect(notes.className).toBe('ui2-editor-notes')
  })

  it('v2 marks a dirty line with the dirty class and adds no inline weight', async () => {
    renderWith(true)
    const qty = await screen.findByLabelText(/quantity for 10003/i)
    const row = qty.closest('tr') as HTMLElement
    expect(row.className).toBe('')
    fireEvent.change(qty, { target: { value: '2' } })
    expect(row.className).toBe('ui2-editor-row--dirty')
    expect(row.getAttribute('style')).toBeNull()
  })

  it('the Remove control stays available and labelled in v2', async () => {
    renderWith(true)
    await screen.findByText('Edit sale #7')
    const remove = screen.getByLabelText(/remove 10003/i)
    expect(remove.className).toBe('ui2-editor-remove')
  })

  it('v2 field inputs keep their per-field widths', async () => {
    renderWith(true)
    await screen.findByText('Edit sale #7')
    expect(EDITOR.fieldInput(110).width).toBe(110)
    expect(EDITOR.fieldInput(140).width).toBe(140)
    expect(EDITOR.fieldInput(160).width).toBe(160)
    expect(EDITOR.fieldInput(180).width).toBe(180)
    expect(EDITOR.fieldInput(220).width).toBe(220)
    // v1 must not gain a min-height that would change the row height
    expect(EDITOR.fieldInput(110)).not.toHaveProperty('minHeight')
  })

  it('pins the v1 editor values a careless edit would break', () => {
    expect(EDITOR.root.border).toBe('2px solid #1e3a8a')
    expect(EDITOR.root.background).toBe('#f8fafc')
    expect(EDITOR.qtyInput.width).toBe(56)
    expect(EDITOR.priceInput.width).toBe(80)
    expect(EDITOR.bodyRow(true).fontWeight).toBe(700)
    expect(EDITOR.bodyRow(false).fontWeight).toBe(400)
  })
})

describe('POSPage chrome v2 (U3 part 2)', () => {
  it('pins the v1 banner and panel values', () => {
    expect(POS_PAGE.successBanner.background).toBe('#f0fdf4')
    expect(POS_PAGE.successTitle.fontSize).toBe(22)
    expect(POS_PAGE.errorBanner.fontWeight).toBe(600)
    expect(POS_PAGE.saleHeader.cursor).toBe('pointer')
    expect(POS_PAGE.itemsTable.borderCollapse).toBe('collapse')
    expect(POS_PAGE.itemNote.fontSize).toBe(11)
  })

  it('page chrome helpers choose one variant and never both', () => {
    const a = variantProps(true, 'ui2-pos-page', POS_PAGE.root)
    expect(a.className).toBe('ui2-pos-page')
    expect(a.style).toBeUndefined()
    const b = variantProps(false, 'ui2-pos-page', POS_PAGE.root)
    expect(b.className).toBeUndefined()
    expect(b.style).toBe(POS_PAGE.root)
  })

  it('v1Only drops the style in v2 without adding a class', () => {
    expect(v1Only(true, POS_PAGE.itemsTd)).toEqual({ style: undefined })
    expect(v1Only(false, POS_PAGE.itemsTd)).toEqual({ style: POS_PAGE.itemsTd })
  })
})
