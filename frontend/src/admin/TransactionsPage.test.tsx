/**
 * Tests for {@link TransactionsPage} (admin) — list every sale with filters,
 * open the shared editor for any sale, and void from the same panel (confirm
 * dialog, re-voided rows flagged).
 *
 * @module TransactionsPage.test
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { AuthProvider } from '../auth/AuthContext'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { TransactionsPage } from './TransactionsPage'
import type { SaleWithItemsResponse } from '../types'

function sale(id: number, creator: string, total: number, isVoided = false): SaleWithItemsResponse {
  return {
    id,
    event_id: 1,
    date_of_sale: '2026-04-04T10:00:00',
    customer_name: null,
    customer_email: null,
    sale_total: total,
    mysl_total: total * 0.3,
    seller_total: total * 0.7,
    cash_amount: total,
    check_amount: 0,
    cc_amount: 0,
    check_number: null,
    cc_transaction_id: null,
    total_paid: total,
    balance_due: 0,
    notes: null,
    is_voided: isVoided,
    created_at: '2026-04-04T10:00:00',
    created_by: creator,
    sale_items: [
      {
        id: id * 10,
        sale_id: id,
        item_id: id * 10,
        item_code: `1000${id}`,
        line_number: 1,
        quantity: 1,
        sell_price: total,
        extended_price: total,
        notes: null,
        created_at: '2026-04-04T10:00:00',
      },
    ],
  }
}

describe('TransactionsPage', () => {
  it('lists sales with status and opens the editor on Edit', async () => {
    server.use(
      http.get("/sales", () => HttpResponse.json([sale(7, 'cashier1', 35), sale(8, 'cashier2', 50, true)])),
      http.get("/sales/:id", () => HttpResponse.json(sale(7, 'cashier1', 35))),
      http.get("/sales/:id/edits", () => HttpResponse.json([])),
    )
    render(
      <AuthProvider>
        <TransactionsPage />
      </AuthProvider>,
    )
    expect(await screen.findByText('#7')).toBeInTheDocument()
    expect(screen.getByText('#8')).toBeInTheDocument()
    expect(screen.getByText('VOIDED')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /edit sale 7/i }))
    expect(await screen.findByText(/Edit sale #7/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close editor/i }))
    expect(await screen.findByText('#7')).toBeInTheDocument()
  })

  it('filters per cashier when provided', async () => {
    server.use(
      http.get("/sales", ({ request }) => {
        const url = new URL(request.url)
        const created_by = url.searchParams.get('created_by')
        return HttpResponse.json(
          created_by === 'cashier2' ? [sale(8, 'cashier2', 50)] : [sale(7, 'cashier1', 35)],
        )
      }),
    )
    render(
      <AuthProvider>
        <TransactionsPage />
      </AuthProvider>,
    )
    expect(await screen.findByText('#7')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/filter by cashier/i), {
      target: { value: 'cashier2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /apply filters/i }))
    expect(await screen.findByText('#8')).toBeInTheDocument()
    expect(screen.queryByText('#7')).not.toBeInTheDocument()
  })

  it('voids a sale after confirm and flags the row', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    server.use(
      http.get("/sales", () => HttpResponse.json([sale(7, 'cashier1', 35)])),
      http.get("/sales/:id", () => HttpResponse.json(sale(7, 'cashier1', 35))),
      http.get("/sales/:id/edits", () => HttpResponse.json([])),
      http.post("/sales/:id/void", () => HttpResponse.json(sale(7, 'cashier1', 35, true))),
    )
    render(
      <AuthProvider>
        <TransactionsPage />
      </AuthProvider>,
    )
    expect(await screen.findByText('#7')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /void sale 7/i }))
    expect(await screen.findByText('VOIDED')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('shows pagination controls and disables Previous on the first page', async () => {
    server.use(http.get("/sales", () => HttpResponse.json([sale(7, 'cashier1', 35)])))
    render(
      <AuthProvider>
        <TransactionsPage />
      </AuthProvider>,
    )
    await screen.findByText('#7')
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled() // only 1 row < page size
  })
})