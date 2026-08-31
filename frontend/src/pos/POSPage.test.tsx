/**
 * Tests for {@link POSPage} — single-page checkout: cart + payment on one screen,
 * item scanning/addition (with duplicate-scan increment), removal, cash sale
 * submission, and reset via New Transaction. `/items/search` is mocked to []
 * to keep queries unambiguous (no autocomplete dropdown).
 *
 * @module POSPage.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { AuthProvider } from '../auth/AuthContext'
import { POSPage } from './POSPage'
import type { ItemLookupResponse, SaleWithItemsResponse } from '../types'

const ITEM_A: ItemLookupResponse = {
  id: 1, intake_id: 1, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: null, type: null, description: 'Red skis',
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 75, quantity: 1,
  remaining: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false, is_deleted: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'A001',
}
const ITEM_MULTI: ItemLookupResponse = { ...ITEM_A, id: 2, code: 'A001-002', quantity: 5, remaining: 5, price: 10 }

const SALE: SaleWithItemsResponse = {
  id: 1, event_id: 1, date_of_sale: '2026-04-04T10:00:00',
  customer_name: null, customer_email: null,
  sale_total: 75, mysl_total: 22.5, seller_total: 52.5,
  cash_amount: 75, check_amount: 0, cc_amount: 0,
  check_number: null, cc_transaction_id: null, total_paid: 75, balance_due: 0,
  notes: null, is_voided: false, created_at: '2026-04-04T10:00:00',
  created_by: 'cashier1', sale_items: [],
}

function lookupReturns(item: ItemLookupResponse) {
  server.use(
    http.get('/items/lookup', () => HttpResponse.json(item)),
    http.get('/items/search', () => HttpResponse.json([])),
  )
}

function renderPOS() {
  render(<AuthProvider><POSPage /></AuthProvider>)
}

function scan(code: string) {
  fireEvent.change(screen.getByPlaceholderText(/scan barcode/i), { target: { value: code } })
  fireEvent.keyDown(screen.getByPlaceholderText(/scan barcode/i), { key: 'Enter' })
}

describe('POSPage', () => {
  it('starts with lookup field, empty cart, and payment form on one page', () => {
    renderPOS()
    expect(screen.getByPlaceholderText(/scan barcode/i)).toBeInTheDocument()
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
    // payment form is visible on the same page; Complete Sale is disabled while cart empty
    expect(screen.getByRole('button', { name: /complete sale/i })).toBeDisabled()
  })

  it('adds scanned item to cart', async () => {
    lookupReturns(ITEM_A)
    renderPOS()
    scan('A001-001')
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    expect(screen.getAllByText('$75.00').length).toBeGreaterThan(0)
  })

  it('removes item from cart when Remove is clicked', async () => {
    lookupReturns(ITEM_A)
    renderPOS()
    scan('A001-001')
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /remove A001-001/i }))
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
  })

  it('increments line quantity when the same item is scanned twice', async () => {
    lookupReturns(ITEM_MULTI)
    renderPOS()
    scan('A001-002')
    await waitFor(() => expect(screen.getByText('A001-002')).toBeInTheDocument())
    scan('A001-002')
    await waitFor(() => expect((screen.getByLabelText(/quantity for A001-002/i) as HTMLInputElement).value).toBe('2'))
  })

  it('completes a cash sale and shows the confirmation screen', async () => {
    lookupReturns(ITEM_A)
    server.use(http.post('/sales', () => HttpResponse.json(SALE)))
    renderPOS()
    scan('A001-001')
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    await waitFor(() => expect(screen.getByText(/sale complete/i)).toBeInTheDocument())
    expect(screen.getByText(/sale #1/i)).toBeInTheDocument()
    // The completed sale is persisted so a reload restores the receipt, not an editable cart.
    expect(localStorage.getItem('pos_sale')).not.toBeNull()
  })

  /** Verifies Cancel abandons the entire checkout: confirmation, cart cleared, back to lookup. */
  it('abandons the whole checkout when Cancel is confirmed', async () => {
    lookupReturns(ITEM_A)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPOS()
    scan('A001-001')
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/scan barcode/i)).toBeInTheDocument()
    expect(localStorage.getItem('pos_cart')).toBeNull()
  })

  /** Verifies declining the Cancel confirmation keeps the cart intact. */
  it('keeps the cart when the Cancel confirmation is declined', async () => {
    lookupReturns(ITEM_A)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPOS()
    scan('A001-001')
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('A001-001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /complete sale/i })).toBeInTheDocument()
  })

  /** Verifies a reload after a completed sale restores the read-only receipt,
   *  not an editable cart of already-sold items. */
  it('restores the receipt after reload instead of an editable cart', () => {
    localStorage.setItem('pos_cart', JSON.stringify([
      { item: ITEM_A, quantity: 1, sell_price: ITEM_A.price, notes: '' },
    ]))
    localStorage.setItem('pos_sale', JSON.stringify(SALE))
    renderPOS()
    expect(screen.getByText(/sale complete/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new transaction/i })).toBeInTheDocument()
    // Nothing is resubmittable: no payment form, no lookup.
    expect(screen.queryByRole('button', { name: /complete sale/i })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/scan barcode/i)).not.toBeInTheDocument()
    // The restored receipt is genuinely read-only: no qty/price inputs, no Remove.
    expect(screen.queryByLabelText(/quantity for A001-001/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/unit price for A001-001/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove A001-001/i })).not.toBeInTheDocument()
  })

  /** Verifies corrupted localStorage degrades to a clean editing state instead
   *  of crashing the POS render (wrong-shape-but-parseable JSON). */
  it('recovers from corrupted localStorage instead of crashing', () => {
    localStorage.setItem('pos_cart', JSON.stringify({ not: 'an array' }))
    localStorage.setItem('pos_sale', JSON.stringify(12345))
    renderPOS()
    // Degraded to an empty editing state: sale dropped, no crash.
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/scan barcode/i)).toBeInTheDocument()
    expect(screen.queryByText(/sale complete/i)).not.toBeInTheDocument()
  })

  /** Verifies New Transaction clears both the cart and the persisted sale. */
  it('clears the persisted sale and cart on New Transaction', () => {
    localStorage.setItem('pos_cart', JSON.stringify([
      { item: ITEM_A, quantity: 1, sell_price: ITEM_A.price, notes: '' },
    ]))
    localStorage.setItem('pos_sale', JSON.stringify(SALE))
    renderPOS()
    fireEvent.click(screen.getByRole('button', { name: /new transaction/i }))
    expect(localStorage.getItem('pos_sale')).toBeNull()
    expect(localStorage.getItem('pos_cart')).toBeNull()
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
  })

  it('returns to empty cart after New Transaction', async () => {
    lookupReturns(ITEM_A)
    server.use(http.post('/sales', () => HttpResponse.json(SALE)))
    renderPOS()
    scan('A001-001')
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /new transaction/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /new transaction/i }))
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
  })

  it('keeps cart visible on the same screen as the confirmation after sale', async () => {
    lookupReturns(ITEM_A)
    server.use(http.post('/sales', () => HttpResponse.json(SALE)))
    renderPOS()
    scan('A001-001')
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    // After completion, the confirmation banner AND the cart (with the sold item) coexist on one screen.
    await waitFor(() => expect(screen.getByText(/sale complete/i)).toBeInTheDocument())
    expect(screen.getByText(/sale #1/i)).toBeInTheDocument()
    expect(screen.getByText('A001-001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new transaction/i })).toBeInTheDocument()
  })

  it('sends per-line quantity in the sale payload', async () => {
    lookupReturns(ITEM_MULTI)
    let captured: { items?: { item_id: number; quantity: number }[] } = {}
    server.use(http.post('/sales', async ({ request }) => {
      captured = (await request.json()) as { items?: { item_id: number; quantity: number }[] }
      return HttpResponse.json({ ...SALE, sale_total: 30, cash_amount: 30 })
    }))
    renderPOS()
    scan('A001-002')
    await waitFor(() => expect(screen.getByText('A001-002')).toBeInTheDocument())
    scan('A001-002')
    await waitFor(() => expect((screen.getByLabelText(/quantity for A001-002/i) as HTMLInputElement).value).toBe('2'))
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    await waitFor(() => expect(captured.items).toBeDefined())
    expect(captured.items![0].quantity).toBe(2)
  })
})