/**
 * Tests for {@link TransactionEditor} — true transaction editing UI: renders
 * sale lines with editable qty/price/notes, per-line save, line removal
 * (units re-stocked, ≥ 1 line rule), add-item via the code lookup, payment &
 * details saving, 422 inline error surfacing, and the audit-history panel.
 *
 * @module TransactionEditor.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthProvider } from '../auth/AuthContext'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { TransactionEditor } from './TransactionEditor'
import type { SaleWithItemsResponse } from '../types'

const ITEM_FIXTURE = {
  id: 101,
  intake_id: 1,
  seller_id: 1,
  code: '10003',
  category: 'Skis',
  brand: null,
  type: null,
  description: 'Red skis',
  color: null,
  size: null,
  uom: null,
  gender_age: null,
  year: null,
  used: true,
  price: 20,
  quantity: 3,
  remaining: 3,
  barcode_39: null,
  label_line_2: null,
  label_line_3: null,
  donate_unsold: false,
  status: 'available',
  label_printed: false,
  is_deleted: false,
  vendor_item_id: null,
  created_at: '2026-04-04T10:00:00',
  seller_code: 'A001',
}

const SALE: SaleWithItemsResponse = {
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
    {
      id: 12,
      sale_id: 7,
      item_id: 102,
      item_code: '10004',
      line_number: 2,
      quantity: 1,
      sell_price: 15,
      extended_price: 15,
      notes: null,
      created_at: '2026-04-04T10:00:01',
    },
  ],
}

function saleFixture(): SaleWithItemsResponse {
  return JSON.parse(JSON.stringify(SALE)) as SaleWithItemsResponse
}

function renderEditor() {
  render(
    <AuthProvider>
      <TransactionEditor saleId={7} onClose={() => {}} />
    </AuthProvider>,
  )
}

describe('TransactionEditor', () => {
  it('loads the sale and renders both line drafts with totals', async () => {
    const sale = saleFixture()
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(sale)),
      http.get('/sales/:id/edits', () => HttpResponse.json([])),
    )
    renderEditor()
    await screen.findByText(/Edit sale #7/)
    expect(screen.getByLabelText(/quantity for 10003/i)).toHaveValue(1)
    expect(screen.getByLabelText(/unit price for 10004/i)).toHaveValue(15)
    expect(screen.getByText(/Recorded by cashier1/)).toBeInTheDocument()
    expect(screen.getAllByText(/\$35\.00/).length).toBeGreaterThanOrEqual(2)
  })

  it('saves dirty lines with a PATCH containing the new quantity', async () => {
    const sale = saleFixture()
    const patch_calls: { url: string; body: Record<string, unknown> }[] = []
    const updated = saleFixture()
    updated.sale_items[0].quantity = 2
    updated.sale_items[0].extended_price = 40
    updated.sale_total = 55
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(sale)),
      http.get('/sales/:id/edits', () => HttpResponse.json([])),
      http.patch('/sales/:id/lines/:lineId', async ({ request }) => {
        patch_calls.push({
          url: new URL(request.url).pathname,
          body: (await request.json()) as Record<string, unknown>,
        })
        return HttpResponse.json(updated)
      }),
    )
    renderEditor()
    await screen.findByText(/Edit sale #7/)
    fireEvent.change(screen.getByLabelText(/quantity for 10003/i), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save line changes/i }))
    await waitFor(() =>
      expect(patch_calls).toEqual([
        { url: '/sales/7/lines/11', body: { quantity: 2, sell_price: 20, notes: undefined } },
      ]),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/line changes saved/i)
  })

  it('surfaces backend stock errors inline (422)', async () => {
    const sale = saleFixture()
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(sale)),
      http.get('/sales/:id/edits', () => HttpResponse.json([])),
      http.patch(
        '/sales/:id/lines/:lineId',
        () =>
          new HttpResponse(
            JSON.stringify({ detail: 'Item 10003 has only 1 remaining' }),
            { status: 422 },
          ),
      ),
    )
    renderEditor()
    await screen.findByText(/Edit sale #7/)
    fireEvent.change(screen.getByLabelText(/quantity for 10003/i), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save line changes/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Item 10003 has only 1 remaining/,
    )
  })

  it('adds an item via the lookup and posts the line', async () => {
    const sale = saleFixture()
    const post_calls: { url: string; body: Record<string, unknown> }[] = []
    const updated = saleFixture()
    updated.sale_items = [
      ...updated.sale_items,
      {
        id: 99,
        sale_id: 7,
        item_id: 101,
        item_code: '10009',
        line_number: 3,
        quantity: 1,
        sell_price: 20,
        extended_price: 20,
        notes: null,
        created_at: '2026-04-04T10:05:00',
      },
    ]
    updated.sale_total = 55
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(sale)),
      http.get('/sales/:id/edits', () => HttpResponse.json([])),
      http.get('/items/lookup', () => HttpResponse.json({ ...ITEM_FIXTURE, code: '10009' })),
      http.get('/items/search', () => HttpResponse.json([])),
      http.post('/sales/:id/lines', async ({ request }) => {
        post_calls.push({
          url: new URL(request.url).pathname,
          body: (await request.json()) as Record<string, unknown>,
        })
        return HttpResponse.json(updated)
      }),
    )
    renderEditor()
    await screen.findByText(/Edit sale #7/)
    fireEvent.change(screen.getByPlaceholderText(/scan barcode/i), {
      target: { value: '10009' },
    })
    fireEvent.keyDown(screen.getByPlaceholderText(/scan barcode/i), { key: 'Enter' })
    await waitFor(() =>
      expect(post_calls).toEqual([
        { url: '/sales/7/lines', body: { item_id: 101, sell_price: 20 } },
      ]),
    )
    expect(await screen.findByText('10009')).toBeInTheDocument()
  })

  it('removes a line after confirm (units re-stocked server-side)', async () => {
    const sale = saleFixture()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const updated = saleFixture()
    updated.sale_items = [updated.sale_items[1]]
    const delete_calls: string[] = []
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(sale)),
      http.get('/sales/:id/edits', () => HttpResponse.json([])),
      http.delete('/sales/:id/lines/:lineId', ({ params }) => {
        delete_calls.push(String(params['lineId']))
        return HttpResponse.json(updated)
      }),
    )
    renderEditor()
    await screen.findByText(/Edit sale #7/)
    fireEvent.click(screen.getByRole('button', { name: /remove 10003/i }))
    await waitFor(() => expect(delete_calls).toEqual(['11']))
    expect(await screen.findByText('10004')).toBeInTheDocument()
    expect(screen.queryByText('10003')).not.toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('blocks removing the last line locally (D8) without a DELETE call', async () => {
    const sale = saleFixture()
    sale.sale_items = [sale.sale_items[0]]
    const delete_calls: string[] = []
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(sale)),
      http.get('/sales/:id/edits', () => HttpResponse.json([])),
      http.delete('/sales/:id/lines/:lineId', ({ params }) => {
        delete_calls.push(String(params['lineId']))
        return HttpResponse.json(saleFixture())
      }),
    )
    renderEditor()
    await screen.findByText(/Edit sale #7/)
    fireEvent.click(screen.getByRole('button', { name: /remove 10003/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /keeps at least one line/i,
    )
    expect(delete_calls).toEqual([])
  })

  it('saves payment changes with a PATCH to the sale', async () => {
    const sale = saleFixture()
    const patch_calls: { url: string; body: Record<string, unknown> }[] = []
    const updated = saleFixture()
    updated.cash_amount = 10
    updated.check_amount = 25
    updated.check_number = '1001'
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(sale)),
      http.get('/sales/:id/edits', () => HttpResponse.json([])),
      http.patch('/sales/:id', async ({ request }) => {
        patch_calls.push({
          url: new URL(request.url).pathname,
          body: (await request.json()) as Record<string, unknown>,
        })
        return HttpResponse.json(updated)
      }),
    )
    renderEditor()
    await screen.findByText(/Edit sale #7/)
    fireEvent.change(screen.getByLabelText(/edit cash amount/i), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText(/edit check amount/i), {
      target: { value: '25' },
    })
    fireEvent.change(screen.getByLabelText(/edit check number/i), {
      target: { value: '1001' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save payment & details/i }))
    await waitFor(() =>
      expect(patch_calls).toEqual([
        {
          url: '/sales/7',
          body: { cash_amount: 10, check_amount: 25, check_number: '1001' },
        },
      ]),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/payment\/details saved/i)
  })

  it('renders the audit history newest first', async () => {
    const sale = saleFixture()
    server.use(
      http.get('/sales/:id', () => HttpResponse.json(sale)),
      http.get('/sales/:id/edits', () =>
        HttpResponse.json([
          // API contract: newest first (id desc)
          {
            id: 6,
            sale_id: 7,
            sale_item_id: null,
            action: 'update_payments',
            before: { cash_amount: 35 },
            after: { cash_amount: 30 },
            edited_by: 'admin',
            edited_at: '2026-04-04T10:40:00',
          },
          {
            id: 5,
            sale_id: 7,
            sale_item_id: 11,
            action: 'update_line',
            before: { item_code: '10003', sell_price: 20, quantity: 1, extended_price: 20 },
            after: { item_code: '10003', sell_price: 18, quantity: 1, extended_price: 18 },
            edited_by: 'cashier1',
            edited_at: '2026-04-04T10:30:00',
          },
        ]),
      ),
    )
    renderEditor()
    await screen.findByText(/Edit sale #7/)
    const listRows = await screen.findAllByRole('listitem')
    expect(listRows).toHaveLength(2)
    expect(listRows[0]).toHaveTextContent('update_payments')
    expect(listRows[1]).toHaveTextContent('update_line')
    expect(screen.getAllByText(/by cashier1|by admin/i).length).toBeGreaterThanOrEqual(2)
  })
})