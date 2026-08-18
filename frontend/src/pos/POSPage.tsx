/**
 * POS checkout page — single-page checkout: item lookup/cart building, payment
 * entry, and confirmation all on one screen. Cart lines (with per-line quantity,
 * price override, and notes) are persisted to localStorage under 'pos_cart'.
 *
 * Phase ('editing' | 'confirmed'): the editing phase shows the lookup field,
 * cart, and payment form together; the confirmed phase shows the receipt and a
 * "New Transaction" button that clears state and returns to editing.
 *
 * @module POSPage
 */
import { useState } from 'react'
import { createSale } from '../api/sales'
import { LookupField } from './LookupField'
import { Cart, type CartLine } from './Cart'
import { PaymentForm, type PaymentSubmit } from './PaymentForm'
import { SquarePayment } from './SquarePayment'
import { ConfirmationScreen } from './ConfirmationScreen'
import type { ItemLookupResponse, SaleWithItemsResponse } from '../types'

const CART_KEY = 'pos_cart'

/**
 * Root POS component. Manages cart lines, checkout phase, Square token, and
 * sale submission. The payment form is always visible below the cart (disabled
 * until the cart is non-empty); no separate payment step.
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
  const [phase, setPhase] = useState<'editing' | 'confirmed'>('editing')
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

  /** Submits the sale (with per-line qty/price/notes + payment breakdown) then shows confirmation. */
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
      setLines([])
      setSale(created)
      setPhase('confirmed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed')
    }
  }

  function handleNewTransaction() {
    setLines([])
    setSale(null)
    setSquareToken(null)
    setError(null)
    setPhase('editing')
  }

  const total = lines.reduce((sum, l) => sum + l.sell_price * l.quantity, 0)

  if (phase === 'confirmed' && sale) {
    return <ConfirmationScreen sale={sale} onNewTransaction={handleNewTransaction} />
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h2>Checkout</h2>
      <LookupField onFound={handleFound} />
      <div style={{ margin: '16px 0' }}>
        <Cart lines={lines} onUpdate={handleUpdate} onRemove={handleRemove} />
      </div>
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
      {error && <div role="alert" style={{ color: 'red', marginTop: 12 }}>{error}</div>}
    </div>
  )
}