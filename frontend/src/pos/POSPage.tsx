/**
 * POS checkout page — orchestrates the three-step checkout flow: item lookup/cart
 * building → payment entry → confirmation. Cart items are persisted to localStorage
 * under the key 'pos_cart' so they survive page refresh.
 *
 * @module POSPage
 */
import { useState } from 'react'
import { createSale } from '../api/sales'
import { LookupField } from './LookupField'
import { Cart } from './Cart'
import { PaymentForm } from './PaymentForm'
import { SquarePayment } from './SquarePayment'
import { ConfirmationScreen } from './ConfirmationScreen'
import type { ItemLookupResponse, SaleWithItemsResponse } from '../types'

const CART_KEY = 'pos_cart'

type POSStep = 'cart' | 'payment' | 'confirmed'

/**
 * Root component for the point-of-sale checkout workflow. Manages cart state,
 * checkout step, Square token, and sale submission. Step progression:
 * 'cart' → 'payment' → 'confirmed'.
 */
export function POSPage() {
  const [items, setItemsState] = useState<ItemLookupResponse[]>(() => {
    try {
      const stored = localStorage.getItem(CART_KEY)
      return stored ? (JSON.parse(stored) as ItemLookupResponse[]) : []
    } catch {
      return []
    }
  })
  const [step, setStep] = useState<POSStep>('cart')
  const [sale, setSale] = useState<SaleWithItemsResponse | null>(null)
  const [squareToken, setSquareToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Updates cart state and syncs the new list to localStorage, clearing the key when the cart is empty. */
  function setItems(updater: ItemLookupResponse[] | ((prev: ItemLookupResponse[]) => ItemLookupResponse[])) {
    setItemsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try {
        if (next.length === 0) localStorage.removeItem(CART_KEY)
        else localStorage.setItem(CART_KEY, JSON.stringify(next))
      } catch { /* non-browser environment */ }
      return next
    })
  }

  /** Appends a newly scanned or selected item to the cart. */
  function handleFound(item: ItemLookupResponse) {
    setItems(prev => [...prev, item])
  }

  /** Removes a single item from the cart by its numeric item ID. */
  function handleRemove(id: number) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  /** Submits the sale to the API with tendered amounts, then advances to the confirmation step. */
  async function handlePayment({ cash, check, square }: {
    cash: number; check: number; square: number; squareToken: string | null
  }) {
    setError(null)
    try {
      const created = await createSale({
        items: items.map(i => ({ item_id: i.id, sell_price: i.price })),
        cash_amount: cash,
        check_amount: check,
        cc_amount: square,
      })
      setItems([])
      setSale(created)
      setStep('confirmed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed')
    }
  }

  /** Resets all state to begin a fresh transaction after a sale is confirmed. */
  function handleNewTransaction() {
    setItems([])
    setSale(null)
    setSquareToken(null)
    setError(null)
    setStep('cart')
  }

  const total = items.reduce((sum, i) => sum + i.price, 0)

  if (step === 'confirmed' && sale) {
    return <ConfirmationScreen sale={sale} onNewTransaction={handleNewTransaction} />
  }

  if (step === 'payment') {
    return (
      <div style={{ maxWidth: 480 }}>
        {error && <div role="alert" style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
        {!squareToken && (
          <div style={{ marginBottom: 20, padding: 16, border: '1px solid #ccc', borderRadius: 4 }}>
            <h4 style={{ margin: '0 0 10px' }}>Pay by Card (Square)</h4>
            <SquarePayment
              onToken={token => setSquareToken(token)}
              onError={msg => setError(msg)}
            />
          </div>
        )}
        <PaymentForm
          total={total}
          squareToken={squareToken}
          onSubmit={handlePayment}
          onCancel={() => { setStep('cart'); setSquareToken(null); setError(null) }}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h2>Checkout</h2>
      <LookupField onFound={handleFound} />
      <div style={{ margin: '16px 0' }}>
        <Cart items={items} onRemove={handleRemove} />
      </div>
      {items.length > 0 && (
        <button
          onClick={() => setStep('payment')}
          style={{ padding: '12px 32px', fontSize: 16, background: '#1a237e', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Checkout — ${total.toFixed(2)}
        </button>
      )}
    </div>
  )
}
