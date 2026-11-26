/**
 * Cart table for the single-page POS checkout — displays one row per distinct
 * item with editable quantity (capped at the item's remaining on-hand quantity),
 * editable per-unit price (with an adjacent notes field for the adjustment
 * reason), a per-line extended total, and a Remove control.
 *
 * @module Cart
 */
import type { ItemLookupResponse } from '../types'
import { CART, variantProps } from './posStyles'
import { useUiVariant } from '../lib/uiVariant'

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
 * @param props.transactionNumber - Display ID of the in-progress transaction
 *  (issue #12): shown in the header once reserved, before any item is scanned.
 */
export function Cart({ lines, onUpdate, onRemove, readOnly = false, transactionNumber }: {
  lines: CartLine[]
  onUpdate: (id: number, patch: CartLinePatch) => void
  onRemove: (id: number) => void
  readOnly?: boolean
  transactionNumber?: number | null
}) {
  const total = lines.reduce((sum, l) => sum + l.sell_price * l.quantity, 0)
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0)  // running total of item units incl. qty > 1
  const itemLabel = `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · `
  const v2 = useUiVariant() === 'v2'

    if (lines.length === 0) {
    return transactionNumber != null ? (
      <p {...variantProps(v2, 'ui2-cart-empty', CART.emptyReserved)}>
        Transaction <strong>#{transactionNumber}</strong> reserved — scan an item to begin.
      </p>
    ) : (
      <p {...variantProps(v2, 'ui2-cart-empty', CART.empty)}>Cart is empty. Scan an item to begin.</p>
    )
  }

  return (
    <div>
      {transactionNumber != null && (
        <div {...variantProps(v2, 'ui2-cart-txn-note', CART.txnNote)}>
          Transaction <strong>#{transactionNumber}</strong> — reserved at start; this ID stays for the whole checkout.
        </div>
      )}
      <table {...variantProps(v2, 'ui2-cart-table', CART.table)}>
        <thead>
          <tr {...variantProps(v2, '', CART.theadRow)}>
            <th {...variantProps(v2, '', CART.thLeft)}>Code</th>
            <th {...variantProps(v2, '', CART.thLeft)}>Seller</th>
            <th {...variantProps(v2, '', CART.thLeft)}>Description</th>
            <th {...variantProps(v2, 'ui2-num', CART.thRight)}>Qty</th>
            <th {...variantProps(v2, 'ui2-num', CART.thRight)}>Unit Price</th>
            <th {...variantProps(v2, 'ui2-num', CART.thRight)}>Line Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map(line => {
            const maxQty = Math.max(1, Math.floor(line.item.remaining))
            return (
              <tr key={line.item.id} {...variantProps(v2, '', CART.bodyRow)}>
                <td {...variantProps(v2, '', CART.td)}>{line.item.code}</td>
                <td {...variantProps(v2, '', CART.td)}>{line.item.seller_code}</td>
                <td {...variantProps(v2, '', CART.td)}>
                  {line.item.description ?? '—'}
                  {(line.item.category || line.item.type) && (
                    <div {...variantProps(v2, 'ui2-cart-item-meta', CART.itemMeta)}>
                      {[line.item.category, line.item.type].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td {...variantProps(v2, 'ui2-num', CART.tdRight)}>
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
                      {...variantProps(v2, 'ui2-cart-qty', CART.qtyInput)}
                    />
                  )}
                </td>
                <td {...variantProps(v2, 'ui2-num', CART.tdRight)}>
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
                      {...variantProps(v2, 'ui2-cart-price', CART.priceInput)}
                    />
                  )}
                </td>
                <td {...variantProps(v2, 'ui2-num', CART.tdRight)}>${(line.sell_price * line.quantity).toFixed(2)}</td>
                <td {...variantProps(v2, '', CART.td)}>
                  {!readOnly && (
                    <button onClick={() => onRemove(line.item.id)} aria-label={`remove ${line.item.code}`} {...variantProps(v2, 'ui2-cart-remove', CART.removeBtn)}>Remove</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {lines.some(l => l.sell_price !== l.item.price) && !readOnly && (
        <div {...variantProps(v2, 'ui2-cart-notes', CART.noteWrap)}>
          {lines.filter(l => l.sell_price !== l.item.price).map(l => (
            <div key={l.item.id} {...variantProps(v2, 'ui2-cart-note-row', CART.noteRow)}>
              <label {...variantProps(v2, 'ui2-cart-note-label', CART.noteLabel)}>Reason for price adjustment — {l.item.code}:</label>
              <input
                value={l.notes}
                aria-label={`price adjustment notes for ${l.item.code}`}
                onChange={e => onUpdate(l.item.id, { notes: e.target.value })}
                placeholder="e.g. damaged binding"
                {...variantProps(v2, 'ui2-cart-note-input', CART.noteInput)}
              />
            </div>
          ))}
        </div>
      )}
      <div {...variantProps(v2, 'ui2-cart-total', CART.total)}>
        {itemLabel}Total: <span>${total.toFixed(2)}</span>
      </div>
    </div>
  )
}
