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
 * Both the cart and the completed sale are persisted to localStorage, so a
 * page reload after a completed sale restores the read-only receipt instead
 * of an editable cart of already-sold items. Cancel abandons the whole
 * checkout (with confirmation), clearing the cart back to lookup state.
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
/** localStorage key preserving the completed sale across reloads. Without it,
 *  a completed checkout comes back after refresh as an editable cart of
 *  already-sold items; with it, the cashier sees the read-only receipt. */
const SALE_KEY = 'pos_sale'

/** Validate restored localStorage JSON shape (defense against corrupted or
 *  hand-edited storage: wrong-shape-but-parseable JSON would otherwise crash
 *  the POS render instead of degrading to an empty state). */
function loadPersistedLines(): CartLine[] {
  try {
    const stored = localStorage.getItem(CART_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? (parsed.filter((l: unknown) => !!l && typeof l === 'object' && 'item' in (l as object)) as CartLine[]) : []
  } catch {
    return []
  }
}

function loadPersistedSale(): SaleWithItemsResponse | null {
  try {
    const stored = localStorage.getItem(SALE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as SaleWithItemsResponse
    if (parsed && typeof parsed === 'object' && typeof parsed.id === 'number'
        && typeof parsed.sale_total === 'number') {
      return parsed
    }
    localStorage.removeItem(SALE_KEY)
    return null
  } catch {
    return null
  }
}

/**
 * Root POS component. Manages cart lines, the completed sale (if any), Square
 * token, and sale submission. The payment form is visible only while editing
 * (no sale in progress); once a sale completes, the inline confirmation banner
 * replaces it on the same page.
 */
export function POSPage() {
  const [lines, setLinesState] = useState<CartLine[]>(loadPersistedLines)
  const [sale, setSale] = useState<SaleWithItemsResponse | null>(loadPersistedSale)
  const [squareToken, setSquareToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Sets the completed sale and persists it so a reload restores the receipt,
   *  not an editable cart of sold items. null clears the persisted copy. */
  function persistSale(s: SaleWithItemsResponse | null) {
    try {
      if (s) localStorage.setItem(SALE_KEY, JSON.stringify(s))
      else localStorage.removeItem(SALE_KEY)
    } catch { /* non-browser environment */ }
    setSale(s)
  }

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
        const maxQty = Math.max(1, Math.floor(item.remaining))
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
        cc_transaction_id: p.square > 0 ? (p.squareToken || p.cardTransactionId || undefined) : undefined,
        notes: p.notes || undefined,
      })
      persistSale(created)
      // Cart lines remain visible as the line-item receipt until New Transaction.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed')
    }
  }

  function handleNewTransaction() {
    setLines([])
    persistSale(null)
    setSquareToken(null)
    setError(null)
  }

  /** Abandons the whole checkout: clears the cart and returns to lookup state.
   *  Asks for confirmation while the cart holds items so a full cart cannot be
   *  wiped by a stray click. */
  function handleCancelCheckout() {
    if (lines.length > 0 && !window.confirm('Cancel this checkout? All scanned items will be cleared from the cart.')) return
    setLines([])
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
        <Cart lines={lines} onUpdate={handleUpdate} onRemove={handleRemove} readOnly={!!sale} />
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
              onCancel={handleCancelCheckout}
            />
          </div>
        </div>
      )}

      {error && <div role="alert" style={{ color: 'red', marginTop: 12 }}>{error}</div>}
    </div>
  )
}