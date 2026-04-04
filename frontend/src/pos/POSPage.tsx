import { useState } from 'react'
import { createSale } from '../api/sales'
import { LookupField } from './LookupField'
import { Cart } from './Cart'
import { PaymentForm } from './PaymentForm'
import { ConfirmationScreen } from './ConfirmationScreen'
import type { ItemLookupResponse, SaleWithItemsResponse } from '../types'

type POSStep = 'cart' | 'payment' | 'confirmed'

export function POSPage() {
  const [items, setItems] = useState<ItemLookupResponse[]>([])
  const [step, setStep] = useState<POSStep>('cart')
  const [sale, setSale] = useState<SaleWithItemsResponse | null>(null)
  const [squareToken, setSquareToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFound(item: ItemLookupResponse) {
    setItems(prev => [...prev, item])
  }

  function handleRemove(id: number) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

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
      setSale(created)
      setStep('confirmed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed')
    }
  }

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
        <PaymentForm
          total={total}
          squareToken={squareToken}
          onSubmit={handlePayment}
          onCancel={() => { setStep('cart'); setError(null) }}
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
