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
  notes: string | null
}

/**
 * Collects cash, check (+ check number), and Square card tender; the card amount
 * is derived from any captured Square token. Validates that the sum of tender
 * meets the sale total before invoking onSubmit.
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
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cashAmt = parseFloat(cash) || 0
  const checkAmt = parseFloat(check) || 0
  const squareAmt = squareToken ? Math.max(0, parseFloat((total - cashAmt - checkAmt).toFixed(2))) : 0
  const tendered = cashAmt + checkAmt + squareAmt

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (tendered < total - 0.001) {
      setError(`Amount tendered ($${tendered.toFixed(2)}) is less than total ($${total.toFixed(2)}).`)
      return
    }
    onSubmit({
      cash: cashAmt,
      check: checkAmt,
      square: squareAmt,
      squareToken,
      checkNumber: checkAmt > 0 ? (checkNumber.trim() || null) : null,
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
      {squareToken && (
        <p style={{ color: '#2e7d32' }}>
          ✓ Card captured via Square — ${squareAmt.toFixed(2)} will be charged.
        </p>
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