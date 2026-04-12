import { useState, useEffect } from 'react'
import { getSellerPayout } from '../api/reports'
import type { SellerPayoutReport } from '../types'

/**
 * Fetches and displays the payout report for a single seller.
 * Manages its own loading and error state.
 *
 * @param props.eventId - ID of the event to report on.
 * @param props.sellerId - ID of the seller whose payout to display.
 */
export function SellerPayoutPanel({ eventId, sellerId }: { eventId: number; sellerId: number }) {
  const [payout, setPayout] = useState<SellerPayoutReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getSellerPayout(eventId, sellerId)
      .then(setPayout)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load payout'))
      .finally(() => setLoading(false))
  }, [eventId, sellerId])

  if (loading) return <p style={{ color: '#64748b', fontSize: 13 }}>Loading payout…</p>
  if (error) return <p role="alert" style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>
  if (!payout) return null

  return (
    <div>
      <table style={{ borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          {[
            ['Items Sold', String(payout.items_sold)],
            ['Gross Sales', `$${payout.gross_sales.toFixed(2)}`],
            ['MYSL Total', `$${payout.mysl_total.toFixed(2)}`],
            ['Seller Payout', `$${payout.seller_total.toFixed(2)}`],
          ].map(([label, val]) => (
            <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 16px 4px 8px', fontWeight: 'bold', fontSize: 13 }}>{label}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 13 }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {payout.line_items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc' }}>
              {['Item Code', 'Description', 'Status', 'Ask Price', 'Sold Price'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payout.line_items.map(li => (
              <tr key={li.item_code} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px', fontSize: 12 }}>{li.item_code}</td>
                <td style={{ padding: '4px 8px', fontSize: 12 }}>{li.description ?? '—'}</td>
                <td style={{ padding: '4px 8px', fontSize: 12 }}>{li.status}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12 }}>${li.price.toFixed(2)}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 12 }}>
                  {li.status === 'sold' ? `$${li.sell_price.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
