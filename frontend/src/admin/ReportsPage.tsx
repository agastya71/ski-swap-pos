import { useState, useEffect, type FormEvent } from 'react'
import { getEventRevenue, getDonations, getUnsoldItems, getSellerPayout, downloadFile } from '../api/reports'
import type { EventRevenueReport, DonationsReport, UnsoldItemsReport, SellerPayoutReport } from '../types'

export function ReportsPage({ eventId }: { eventId: number }) {
  const [revenue, setRevenue] = useState<EventRevenueReport | null>(null)
  const [donations, setDonations] = useState<DonationsReport | null>(null)
  const [unsold, setUnsold] = useState<UnsoldItemsReport | null>(null)
  const [sellerIdInput, setSellerIdInput] = useState('')
  const [payout, setPayout] = useState<SellerPayoutReport | null>(null)
  const [payoutError, setPayoutError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getEventRevenue(eventId).then(setRevenue),
      getDonations(eventId).then(setDonations),
      getUnsoldItems(eventId).then(setUnsold),
    ]).catch(() => {})
  }, [eventId])

  async function handlePayoutLookup(e: FormEvent) {
    e.preventDefault()
    setPayoutError(null)
    setPayout(null)
    try {
      const data = await getSellerPayout(eventId, parseInt(sellerIdInput))
      setPayout(data)
    } catch (err) {
      setPayoutError(err instanceof Error ? err.message : 'Failed to load payout')
    }
  }

  return (
    <div>
      {/* Event Revenue */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Event Revenue</h3>
          <button onClick={() => downloadFile(`/reports/${eventId}/revenue?format=csv`, 'event-revenue.csv')}>
            Download CSV
          </button>
        </div>
        {revenue && (
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Gross Revenue', `$${revenue.gross_revenue.toFixed(2)}`],
                ['MYSL Total', `$${revenue.mysl_total.toFixed(2)}`],
                ['Seller Total', `$${revenue.seller_total.toFixed(2)}`],
                ['Transactions', String(revenue.total_sales)],
                ['Cash', `$${revenue.cash_total.toFixed(2)}`],
                ['Check', `$${revenue.check_total.toFixed(2)}`],
                ['Card (Square)', `$${revenue.cc_total.toFixed(2)}`],
              ].map(([label, val]) => (
                <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 16px 4px 8px', fontWeight: 'bold' }}>{label}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Donations */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Donations</h3>
          <button onClick={() => downloadFile(`/reports/${eventId}/donations?format=csv`, 'donations.csv')}>
            Download CSV
          </button>
        </div>
        {donations && (
          <>
            <p>Total donated items: <strong>{donations.total_items}</strong> (value: ${donations.total_value.toFixed(2)})</p>
            {donations.items.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ccc' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Seller</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Item Code</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Price</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {donations.items.map(item => (
                    <tr key={`${item.seller_code}-${item.item_code}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '4px 8px' }}>{item.seller_code}</td>
                      <td style={{ padding: '4px 8px' }}>{item.item_code}</td>
                      <td style={{ padding: '4px 8px' }}>{item.description ?? '—'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                      <td style={{ padding: '4px 8px' }}>{item.donation_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* Unsold Items */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Unsold Items</h3>
          <button onClick={() => downloadFile(`/reports/${eventId}/unsold?format=csv`, 'unsold-items.csv')}>
            Download CSV
          </button>
        </div>
        {unsold && unsold.items.length === 0 && <p>No unsold items.</p>}
        {unsold && unsold.items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ccc' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Seller</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Code</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Category</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {unsold.items.map(item => (
                <tr key={`${item.seller_code}-${item.item_code}`} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px' }}>{item.seller_code}</td>
                  <td style={{ padding: '4px 8px' }}>{item.item_code}</td>
                  <td style={{ padding: '4px 8px' }}>{item.description ?? '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{item.category ?? '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Seller Payout Lookup */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Seller Payout</h3>
          {payout && (
            <button onClick={() => downloadFile(`/reports/${eventId}/seller/${payout.seller_id}?format=csv`, `payout-${payout.seller_code}.csv`)}>
              Download CSV
            </button>
          )}
        </div>
        <form onSubmit={handlePayoutLookup} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <label htmlFor="sellerIdInput" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Seller ID</label>
            <input
              id="sellerIdInput"
              type="number"
              value={sellerIdInput}
              onChange={e => setSellerIdInput(e.target.value)}
              required
              style={{ width: 120, padding: 6 }}
            />
          </div>
          <button type="submit">Get Payout</button>
        </form>
        {payoutError && <div role="alert" style={{ color: 'red' }}>{payoutError}</div>}
        {payout && (
          <div>
            <p><strong>{payout.seller_name}</strong> ({payout.seller_code})</p>
            <table style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Items Sold', String(payout.items_sold)],
                  ['Gross Sales', `$${payout.gross_sales.toFixed(2)}`],
                  ['MYSL Total', `$${payout.mysl_total.toFixed(2)}`],
                  ['Seller Payout', `$${payout.seller_total.toFixed(2)}`],
                ].map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '4px 16px 4px 8px', fontWeight: 'bold' }}>{label}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
