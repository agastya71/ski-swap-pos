/**
 * POS checkout page — single-page checkout: item lookup/cart building, payment
 * entry, and confirmation all on one screen. Cart lines (with per-line quantity,
 * price override, and notes) are persisted to localStorage under 'pos_cart'.
 *
 * When a sale completes, an inline confirmation banner (receipt summary + a
 * "New Transaction" button) appears on the SAME screen as the cart — the cart
 * stays visible as the line-item receipt. "New Transaction" clears state and
 * returns to editing. There is no separate confirmation screen.
 *
 * @module POSPage
 */
import { useState } from 'react'
import { createSale } from '../api/sales'
import { LookupField } from './LookupField'
import { Cart, type CartLine } from './Cart'
import { PaymentForm, type PaymentSubmit } from './PaymentForm'
import { SquarePayment } from './SquarePayment'
import type { ItemLookupResponse, SaleWithItemsResponse } from '../types'

const CART_KEY = 'pos_cart'

/**
 * Root POS component. Manages cart lines, the completed sale (if any), Square
 * token, and sale submission. The payment form is visible only while editing
 * (no sale in progress); once a sale completes, the inline confirmation banner
 * replaces it on the same page.
 */
export function POSPage() {
  const [lines, setLinesState] = useState<CartLine[]>(() => {
    try {
      const stored = localStorage.getItem(CART_KEY)
      return stored ? (JSON.parse(stored) as CartLine[]) : []
    } catch {
      return []
    }
  })
  const [sale, setSale] = useState<SaleWithItemsResponse | null>(null)
  const [squareToken, setSquareToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function setLines(updater: CartLine[] | ((prev: CartLine[]) => CartLine[])) {
    setLinesState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try {
        if (next.length === 0) localStorage.removeItem(CART_KEY)
        else localStorage.setItem(CART_KEY, JSON.stringify(next))
      } catch { /* non-browser environment */ }
      return next
    })
  }

  /** Appends a scanned/selected item; if already in the cart, increments quantity (capped at remaining). */
  function handleFound(item: ItemLookupResponse) {
    setLines(prev => {
      const existing = prev.find(l => l.item.id === item.id)
      if (existing) {
        const maxQty = Math.max(1, Math.floor(item.quantity))
        return prev.map(l => l.item.id === item.id
          ? { ...l, quantity: Math.min(l.quantity + 1, maxQty) }
          : l)
      }
      return [...prev, { item, quantity: 1, sell_price: item.price, notes: '' }]
    })
  }

  function handleUpdate(id: number, patch: Partial<CartLine>) {
    setLines(prev => prev.map(l => l.item.id === id ? { ...l, ...patch } : l))
  }

  function handleRemove(id: number) {
    setLines(prev => prev.filter(l => l.item.id !== id))
  }

  /** Submits the sale (with per-line qty/price/notes + payment breakdown) then shows the inline confirmation. */
  async function handlePayment(p: PaymentSubmit) {
    setError(null)
    try {
      const created = await createSale({
        items: lines.map(l => ({
          item_id: l.item.id,
          quantity: l.quantity,
          sell_price: l.sell_price,
          notes: l.notes || undefined,
        })),
        cash_amount: p.cash,
        check_amount: p.check,
        check_number: p.checkNumber || undefined,
        cc_amount: p.square,
        cc_transaction_id: p.square > 0 ? (p.squareToken || undefined) : undefined,
        notes: p.notes || undefined,
      })
      setSale(created)
      // Cart lines remain visible as the line-item receipt until New Transaction.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed')
    }
  }

  function handleNewTransaction() {
    setLines([])
    setSale(null)
    setSquareToken(null)
    setError(null)
  }

  const total = lines.reduce((sum, l) => sum + l.sell_price * l.quantity, 0)

  return (
    <div style={{ maxWidth: 900 }}>
      <h2>Checkout</h2>

      {/* Inline confirmation banner — same screen as the cart. */}
      {sale && (
        <div style={{ border: '2px solid #2e7d32', borderRadius: 6, padding: 16, marginBottom: 16, background: '#f0fdf4' }}>
          <div style={{ fontSize: 22, color: '#2e7d32', fontWeight: 700, marginBottom: 4 }}>✓ Sale Complete!</div>
          <div style={{ fontSize: 16 }}>
            Sale #{sale.id} — <strong>${sale.sale_total.toFixed(2)}</strong> — Cashier: {sale.created_by ?? '—'}
          </div>
          <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
            {sale.cash_amount > 0 && <span>Cash: ${sale.cash_amount.toFixed(2)} </span>}
            {sale.check_amount > 0 && <span>Check: ${sale.check_amount.toFixed(2)}{sale.check_number ? ` (#${sale.check_number})` : ''} </span>}
            {sale.cc_amount > 0 && <span>Card: ${sale.cc_amount.toFixed(2)}{sale.cc_transaction_id ? ` (${sale.cc_transaction_id})` : ''} </span>}
          </div>
          <button
            onClick={handleNewTransaction}
            style={{ marginTop: 12, padding: '12px 32px', fontSize: 16, background: '#1a237e', color: 'white', border: 'none', cursor: 'pointer', borderRadius: 3 }}
          >
            New Transaction
          </button>
        </div>
      )}

      {!sale && <LookupField onFound={handleFound} />}

      <div style={{ margin: '16px 0' }}>
        <Cart lines={lines} onUpdate={handleUpdate} onRemove={handleRemove} />
      </div>

      {!sale && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 320 }}>
            {!squareToken && (
              <div style={{ marginBottom: 16, padding: 12, border: '1px solid #ccc', borderRadius: 4 }}>
                <h4 style={{ margin: '0 0 8px' }}>Pay by Card (Square)</h4>
                <SquarePayment onToken={token => setSquareToken(token)} onError={msg => setError(msg)} />
              </div>
            )}
            <PaymentForm
              total={total}
              squareToken={squareToken}
              onSubmit={handlePayment}
              onCancel={() => { setSquareToken(null); setError(null) }}
            />
          </div>
        </div>
      )}

      {error && <div role="alert" style={{ color: 'red', marginTop: 12 }}>{error}</div>}
    </div>
  )
}