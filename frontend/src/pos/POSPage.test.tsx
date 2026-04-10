/**
 * Tests for {@link POSPage} — covers the full three-step checkout flow: initial
 * cart render, item scanning/addition, item removal, step transitions to payment,
 * successful cash sale submission, and resetting to a new transaction.
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
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'A001',
}

const SALE: SaleWithItemsResponse = {
  id: 1, event_id: 1, date_of_sale: '2026-04-04',
  customer_name: null, customer_email: null,
  sale_total: 75, mysl_total: 22.5, seller_total: 52.5,
  cash_amount: 75, check_amount: 0, cc_amount: 0,
  check_number: null, total_paid: 75, balance_due: 0,
  notes: null, is_voided: false, created_at: '2026-04-04T10:00:00',
  created_by: null, sale_items: [],
}

function renderPOS() {
  render(<AuthProvider><POSPage /></AuthProvider>)
}

/** Integration tests for the POSPage component rendered with AuthProvider. */
describe('POSPage', () => {
  /** Verifies the initial cart step renders the lookup input and empty-cart message. */
  it('starts with lookup field and empty cart', () => {
    renderPOS()
    expect(screen.getByPlaceholderText(/scan barcode/i)).toBeInTheDocument()
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
  })

  /** Verifies that scanning an item code and pressing Enter appends the item to the cart. */
  it('adds scanned item to cart', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(ITEM_A)))
    renderPOS()
    fireEvent.change(screen.getByPlaceholderText(/scan barcode/i), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/scan barcode/i), { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    expect(screen.getAllByText('$75.00').length).toBeGreaterThan(0)
  })

  /** Verifies that clicking the Remove button on a cart row deletes that item and shows the empty-cart message. */
  it('removes item from cart when Remove is clicked', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(ITEM_A)))
    renderPOS()
    fireEvent.change(screen.getByPlaceholderText(/scan barcode/i), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/scan barcode/i), { key: 'Enter' })
    await waitFor(() => screen.getByText('A001-001'))
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
  })

  /** Verifies the Checkout button appears once at least one item is in the cart. */
  it('shows Checkout button when cart has items', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(ITEM_A)))
    renderPOS()
    fireEvent.change(screen.getByPlaceholderText(/scan barcode/i), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/scan barcode/i), { key: 'Enter' })
    await waitFor(() => screen.getByText('A001-001'))
    expect(screen.getByRole('button', { name: /checkout/i })).toBeInTheDocument()
  })

  /** Verifies clicking Checkout transitions to the payment step and renders the PaymentForm. */
  it('shows PaymentForm when Checkout is clicked', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(ITEM_A)))
    renderPOS()
    fireEvent.change(screen.getByPlaceholderText(/scan barcode/i), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/scan barcode/i), { key: 'Enter' })
    await waitFor(() => screen.getByText('A001-001'))
    fireEvent.click(screen.getByRole('button', { name: /checkout/i }))
    expect(screen.getByRole('button', { name: /complete sale/i })).toBeInTheDocument()
  })

  /** Verifies a complete cash-only sale submission renders the ConfirmationScreen with sale details. */
  it('shows confirmation screen after successful cash sale', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json(ITEM_A)),
      http.post('/sales', () => HttpResponse.json(SALE)),
    )
    renderPOS()
    fireEvent.change(screen.getByPlaceholderText(/scan barcode/i), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/scan barcode/i), { key: 'Enter' })
    await waitFor(() => screen.getByText('A001-001'))
    fireEvent.click(screen.getByRole('button', { name: /checkout/i }))
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    await waitFor(() => expect(screen.getByText(/sale complete/i)).toBeInTheDocument())
    expect(screen.getByText(/sale #1/i)).toBeInTheDocument()
  })

  /** Verifies clicking 'New Transaction' on the confirmation screen resets the POS to an empty cart. */
  it('returns to empty cart after New Transaction', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json(ITEM_A)),
      http.post('/sales', () => HttpResponse.json(SALE)),
    )
    renderPOS()
    fireEvent.change(screen.getByPlaceholderText(/scan barcode/i), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/scan barcode/i), { key: 'Enter' })
    await waitFor(() => screen.getByText('A001-001'))
    fireEvent.click(screen.getByRole('button', { name: /checkout/i }))
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /complete sale/i }))
    await waitFor(() => screen.getByRole('button', { name: /new transaction/i }))
    fireEvent.click(screen.getByRole('button', { name: /new transaction/i }))
    expect(screen.getByText(/cart is empty/i)).toBeInTheDocument()
  })
})
