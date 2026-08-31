/**
 * Payment entry form — splits tender across cash, check, and Square card,
 * collects the check number (when paying by check) and free-text sale notes,
 * validates that the total tendered meets the sale total, and submits.
 *
 * @module PaymentForm
 */
import { useState, type FormEvent } from 'react'

export interface PaymentSubmit {
  cash: number
  check: number
  square: number
  squareToken: string | null
  checkNumber: string | null
  /** Manually entered card transaction/reference id, used when the card was
   *  processed on a physical terminal rather than captured via the Square SDK. */
  cardTransactionId: string | null
  notes: string | null
}

/**
 * Collects cash, check (+ check number), and card tender. Card is captured via
 * the Square SDK (token → transaction id) or, when the card was processed on a
 * physical terminal, entered manually with a transaction id. Validates before
 * submit that: a check number is present for check payment, a card transaction
 * id is present for card payment, and the sum of tender meets the sale total —
 * all surfaced as field-level errors without a server round-trip.
 *
 * @param props.total - Sale total in dollars; tendered amounts must sum to at least this value.
 * @param props.squareToken - Square SDK nonce after card capture, or null.
 * @param props.onSubmit - Callback with the full payment breakdown once validation passes.
 * @param props.onCancel - Callback invoked when the cashier clicks Cancel.
 */
export function PaymentForm({ total, onSubmit, onCancel, squareToken }: {
  total: number
  onSubmit: (payment: PaymentSubmit) => void
  onCancel: () => void
  squareToken: string | null
}) {
  const [cash, setCash] = useState('')
  const [check, setCheck] = useState('')
  const [checkNumber, setCheckNumber] = useState('')
  const [card, setCard] = useState('')
  const [cardId, setCardId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cashAmt = parseFloat(cash) || 0
  const checkAmt = parseFloat(check) || 0
  // With a Square token the card amount is the remaining balance (SDK capture);
  // without one the cashier types the card amount manually (terminal payment).
  const cardAmt = squareToken
    ? Math.max(0, parseFloat((total - cashAmt - checkAmt).toFixed(2)))
    : parseFloat(card) || 0
  const tendered = cashAmt + checkAmt + cardAmt

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (checkAmt > 0 && !checkNumber.trim()) {
      setError('Check number is required for check payments.')
      return
    }
    if (cardAmt > 0 && !squareToken && !cardId.trim()) {
      setError('Card transaction ID is required for card payments.')
      return
    }
    if (tendered < total - 0.001) {
      setError(`Amount tendered ($${tendered.toFixed(2)}) is less than total ($${total.toFixed(2)}).`)
      return
    }
    onSubmit({
      cash: cashAmt,
      check: checkAmt,
      square: cardAmt,
      squareToken,
      checkNumber: checkAmt > 0 ? (checkNumber.trim() || null) : null,
      cardTransactionId: cardAmt > 0 && !squareToken ? (cardId.trim() || null) : null,
      notes: notes.trim() || null,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Payment — Total: ${total.toFixed(2)}</h3>
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="cash" style={{ display: 'block', marginBottom: 4 }}>Cash ($)</label>
        <input id="cash" type="number" min="0" step="0.01" value={cash}
          onChange={e => setCash(e.target.value)} style={{ padding: 8, fontSize: 16, width: 140 }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="check" style={{ display: 'block', marginBottom: 4 }}>Check ($)</label>
        <input id="check" type="number" min="0" step="0.01" value={check}
          onChange={e => setCheck(e.target.value)} style={{ padding: 8, fontSize: 16, width: 140 }} />
      </div>
      {checkAmt > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="checkNumber" style={{ display: 'block', marginBottom: 4 }}>Check Number</label>
          <input id="checkNumber" type="text" value={checkNumber}
            onChange={e => setCheckNumber(e.target.value)} style={{ padding: 8, fontSize: 16, width: 200 }} />
        </div>
      )}
      {squareToken ? (
        <p style={{ color: '#2e7d32' }}>
          ✓ Card captured via Square — ${cardAmt.toFixed(2)} will be charged.
        </p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <div>
            <label htmlFor="card" style={{ display: 'block', marginBottom: 4 }}>Card ($) — if charged on the Square terminal</label>
            <input id="card" type="number" min="0" step="0.01" value={card}
              onChange={e => { setCard(e.target.value); setError(null) }} style={{ padding: 8, fontSize: 16, width: 140 }} />
          </div>
          <div style={{ marginTop: 8 }}>
            <label htmlFor="cardId" style={{ display: 'block', marginBottom: 4 }}>Card Transaction ID</label>
            <input id="cardId" type="text" value={cardId}
              onChange={e => setCardId(e.target.value)} style={{ padding: 8, fontSize: 16, width: 200 }} />
          </div>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="saleNotes" style={{ display: 'block', marginBottom: 4 }}>Sale notes (optional, printed on receipt)</label>
        <textarea id="saleNotes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          style={{ width: '100%', padding: 8, fontSize: 14, boxSizing: 'border-box' }} />
      </div>
      {error && <div role="alert" style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="submit" disabled={total <= 0}
          style={{ padding: '10px 24px', fontSize: 16, background: '#1a237e', color: 'white', border: 'none', cursor: total > 0 ? 'pointer' : 'default' }}>
          Complete Sale
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '10px 24px', fontSize: 16 }}>Cancel</button>
      </div>
    </form>
  )
}