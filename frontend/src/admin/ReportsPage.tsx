/**
 * Admin reports page — aggregates and displays four end-of-event reports:
 * Event Revenue, Donations, Unsold Items, and per-Seller Payout. The first
 * three sections are collapsed by default showing only totals; clicking the
 * section heading expands the full table. Download CSV is always accessible.
 * Seller Payout section remains always visible with an ID-based lookup form.
 */

import { useState, useEffect, type ReactNode, type FormEvent } from 'react'
import { getEventRevenue, getDonations, getUnsoldItems, downloadFile } from '../api/reports'
import type { EventRevenueReport, DonationsReport, UnsoldItemsReport, Seller } from '../types'
import { SellerCombobox } from '../components/SellerCombobox'
import { SellerPayoutPanel } from './SellerPayoutPanel'

/** Display name for a seller, matching the rest of the app (individuals use
 *  first/last name; vendors use company; fall back to the code if neither). */
function sellerDisplayName(s: Seller): string {
  if (s.is_vendor) return s.company ?? s.code
  const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()
  return name || s.code
}

export function ReportsPage({ eventId }: { eventId: number }) {
  const [revenue, setRevenue] = useState<EventRevenueReport | null>(null)
  const [donations, setDonations] = useState<DonationsReport | null>(null)
  const [unsold, setUnsold] = useState<UnsoldItemsReport | null>(null)
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  // The seller whose payout is currently shown. Set on "Get Payout" submit;
  // the actual report is fetched and rendered by <SellerPayoutPanel>.
  const [payoutSeller, setPayoutSeller] = useState<Seller | null>(null)
  const [open, setOpen] = useState({ revenue: false, donations: false, unsold: false })

  useEffect(() => {
    Promise.all([
      getEventRevenue(eventId).then(setRevenue),
      getDonations(eventId).then(setDonations),
      getUnsoldItems(eventId).then(setUnsold),
    ]).catch(() => {})
  }, [eventId])

  function toggle(key: 'revenue' | 'donations' | 'unsold') {
    setOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handlePayoutLookup(e: FormEvent) {
    e.preventDefault()
    if (!selectedSeller) return
    setPayoutSeller(selectedSeller)
  }

  const sectionHeader = (
    key: 'revenue' | 'donations' | 'unsold',
    title: string,
    summary: ReactNode,
    csvFile: string,
    csvName: string,
  ) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open[key] ? 12 : 0 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}
        onClick={() => toggle(key)}
      >
        <span style={{ color: '#1a237e', fontSize: 11, userSelect: 'none' }}>{open[key] ? '▼' : '▶'}</span>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {!open[key] && summary && (
          <span style={{ color: '#64748b', fontSize: 13 }}>{summary}</span>
        )}
      </div>
      <button
        onClick={() => downloadFile(csvFile, csvName)}
        style={{ border: '1px solid #1a237e', color: '#1a237e', background: 'none', padding: '3px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
      >
        Download CSV
      </button>
    </div>
  )

  return (
    <div>
      {/* Event Revenue */}
      <section style={{ marginBottom: 32 }}>
        {sectionHeader(
          'revenue',
          'Event Revenue',
          revenue && <>Gross Revenue: <strong>${revenue.gross_revenue.toFixed(2)}</strong></>,
          `/reports/${eventId}/revenue?format=csv`,
          'event-revenue.csv',
        )}
        {open.revenue && revenue && (
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
        {sectionHeader(
          'donations',
          'Donations',
          donations && (
            donations.total_items > 0
              ? <>{donations.total_items} items · <strong>${donations.total_value.toFixed(2)}</strong></>
              : <>No donations</>
          ),
          `/reports/${eventId}/donations?format=csv`,
          'donations.csv',
        )}
        {open.donations && donations && (
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
                      <td style={{ padding: '4px 8px' }}>
                        <span style={{ fontWeight: 500 }}>{item.seller_name}</span>
                        <span style={{ color: '#64748b', fontSize: 12, marginLeft: 4 }}>({item.seller_code})</span>
                      </td>
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
        {sectionHeader(
          'unsold',
          'Unsold Items',
          unsold && (
            unsold.total_items > 0
              ? <>{unsold.total_items} items · <strong>${unsold.total_value.toFixed(2)}</strong></>
              : <>No unsold items</>
          ),
          `/reports/${eventId}/unsold?format=csv`,
          'unsold-items.csv',
        )}
        {open.unsold && unsold && (
          <>
            {unsold.items.length === 0 && <p>No unsold items.</p>}
            {unsold.items.length > 0 && (
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
                      <td style={{ padding: '4px 8px' }}>
                        <span style={{ fontWeight: 500 }}>{item.seller_name}</span>
                        <span style={{ color: '#64748b', fontSize: 12, marginLeft: 4 }}>({item.seller_code})</span>
                      </td>
                      <td style={{ padding: '4px 8px' }}>{item.item_code}</td>
                      <td style={{ padding: '4px 8px' }}>{item.description ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{item.category ?? '—'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      {/* Seller Payout Lookup */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Seller Payout</h3>
          {payoutSeller && (
            <button onClick={() => downloadFile(`/reports/${eventId}/seller/${payoutSeller.id}?format=csv`, `payout-${payoutSeller.code}.csv`)}>
              Download CSV
            </button>
          )}
        </div>
        <form onSubmit={handlePayoutLookup} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Seller</label>
            <SellerCombobox onSelect={setSelectedSeller} placeholder="Search by name or code..." />
          </div>
          <button type="submit" disabled={!selectedSeller}>Get Payout</button>
        </form>
        {payoutSeller && (
          <div>
            <p><strong>{sellerDisplayName(payoutSeller)}</strong> ({payoutSeller.code})</p>
            {/* Reuses the same payout panel as the Sellers page so the summary
                and line-items tables are identical everywhere. */}
            <SellerPayoutPanel eventId={eventId} sellerId={payoutSeller.id} />
          </div>
        )}
      </section>
    </div>
  )
}
