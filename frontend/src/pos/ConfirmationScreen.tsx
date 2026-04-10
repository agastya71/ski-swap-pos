/**
 * Post-sale confirmation screen — displays a receipt summary after a successful
 * transaction and provides a 'New Transaction' button to reset the POS.
 *
 * @module ConfirmationScreen
 */
import type { SaleWithItemsResponse } from '../types'

/**
 * Displays a receipt summary including sale ID, item count, total, and per-tender
 * breakdown (cash, check, card). The 'New Transaction' button resets the POS flow.
 *
 * @param props.sale - The completed sale returned from the API, including all line items and tender amounts.
 * @param props.onNewTransaction - Callback invoked when the cashier clicks 'New Transaction' to start fresh.
 */
export function ConfirmationScreen({ sale, onNewTransaction }: {
  sale: SaleWithItemsResponse
  onNewTransaction: () => void
}) {
  const count = sale.sale_items.length
  return (
    <div style={{ textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 48, color: '#2e7d32', marginBottom: 16 }}>✓</div>
      <h2>Sale Complete!</h2>
      <p style={{ fontSize: 20 }}>Sale #{sale.id} — {count} item{count !== 1 ? 's' : ''}</p>
      <p style={{ fontSize: 28, fontWeight: 'bold' }}>${sale.sale_total.toFixed(2)}</p>
      <div style={{ marginBottom: 24, color: '#555', fontSize: 14 }}>
        {sale.cash_amount > 0 && <div>Cash: ${sale.cash_amount.toFixed(2)}</div>}
        {sale.check_amount > 0 && <div>Check: ${sale.check_amount.toFixed(2)}</div>}
        {sale.cc_amount > 0 && <div>Card: ${sale.cc_amount.toFixed(2)}</div>}
      </div>
      <button
        onClick={onNewTransaction}
        style={{ padding: '14px 36px', fontSize: 18, background: '#1a237e', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        New Transaction
      </button>
    </div>
  )
}
