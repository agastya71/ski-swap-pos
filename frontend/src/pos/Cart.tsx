/**
 * Cart table for the single-page POS checkout — displays one row per distinct
 * item with editable quantity (capped at the item's remaining on-hand quantity),
 * editable per-unit price (with an adjacent notes field for the adjustment
 * reason), a per-line extended total, and a Remove control.
 *
 * @module Cart
 */
import type { ItemLookupResponse } from '../types'

/** A single line in the cart: the looked-up item plus sale-time overrides. */
export interface CartLine {
  item: ItemLookupResponse
  quantity: number
  sell_price: number
  notes: string
}

/** Patch applied to a cart line by the cashier (quantity / price / notes). */
export type CartLinePatch = Partial<Pick<CartLine, 'quantity' | 'sell_price' | 'notes'>>

/**
 * Renders the cart as a table. The cashier can adjust quantity (1..item.remaining),
 * override the unit price (with a notes field for the reason), or remove a line.
 * A running total sums each line's extended price (sell_price × quantity).
 *
 * When `readOnly` is set (completed-sale receipt), rows render as plain text —
 * no qty/price inputs, no price-adjustment notes, no Remove — so a restored
 * receipt can never be edited back into an "active" checkout.
 *
 * @param props.lines - Cart lines currently in the transaction.
 * @param props.onUpdate - Callback to update a line by item id with a patch.
 * @param props.onRemove - Callback to remove a line by item id.
 * @param props.readOnly - Render as a receipt: text cells only, no edit controls.
 */
export function Cart({ lines, onUpdate, onRemove, readOnly = false }: {
  lines: CartLine[]
  onUpdate: (id: number, patch: CartLinePatch) => void
  onRemove: (id: number) => void
  readOnly?: boolean
}) {
  const total = lines.reduce((sum, l) => sum + l.sell_price * l.quantity, 0)

  if (lines.length === 0) {
    return <p style={{ color: '#888', fontStyle: 'italic' }}>Cart is empty. Scan an item to begin.</p>
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc', fontSize: 13, color: '#555' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Code</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Seller</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Qty</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Unit Price</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Line Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map(line => {
            const maxQty = Math.max(1, Math.floor(line.item.remaining))
            return (
              <tr key={line.item.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 8px' }}>{line.item.code}</td>
                <td style={{ padding: '6px 8px' }}>{line.item.seller_code}</td>
                <td style={{ padding: '6px 8px' }}>{line.item.description ?? '—'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  {readOnly ? (
                    line.quantity
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={maxQty}
                      value={line.quantity}
                      aria-label={`quantity for ${line.item.code}`}
                      onChange={e => {
                        const q = parseInt(e.target.value, 10)
                        onUpdate(line.item.id, { quantity: Number.isNaN(q) ? 1 : Math.min(Math.max(1, q), maxQty) })
                      }}
                      style={{ width: 56, padding: '4px 6px', fontSize: 14, textAlign: 'right' }}
                    />
                  )}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  {readOnly ? (
                    `$${line.sell_price.toFixed(2)}`
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.sell_price}
                      aria-label={`unit price for ${line.item.code}`}
                      onChange={e => {
                        const p = parseFloat(e.target.value)
                        onUpdate(line.item.id, { sell_price: Number.isNaN(p) ? 0 : p })
                      }}
                      style={{ width: 80, padding: '4px 6px', fontSize: 14, textAlign: 'right' }}
                    />
                  )}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>${(line.sell_price * line.quantity).toFixed(2)}</td>
                <td style={{ padding: '6px 8px' }}>
                  {!readOnly && (
                    <button onClick={() => onRemove(line.item.id)} aria-label={`remove ${line.item.code}`} style={{ fontSize: 12, cursor: 'pointer' }}>Remove</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {lines.some(l => l.sell_price !== l.item.price) && !readOnly && (
        <div style={{ marginBottom: 8 }}>
          {lines.filter(l => l.sell_price !== l.item.price).map(l => (
            <div key={l.item.id} style={{ marginBottom: 4, fontSize: 13 }}>
              <label style={{ color: '#64748b' }}>Reason for price adjustment — {l.item.code}:</label>
              <input
                value={l.notes}
                aria-label={`price adjustment notes for ${l.item.code}`}
                onChange={e => onUpdate(l.item.id, { notes: e.target.value })}
                placeholder="e.g. damaged binding"
                style={{ marginLeft: 8, padding: '4px 6px', fontSize: 13, width: 220 }}
              />
            </div>
          ))}
        </div>
      )}
      <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 20 }}>
        Total: <span>${total.toFixed(2)}</span>
      </div>
    </div>
  )
}