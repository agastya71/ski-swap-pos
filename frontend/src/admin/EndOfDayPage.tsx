import { useState, useEffect } from 'react'
import { getEndOfDay, downloadFile } from '../api/reports'
import type { EndOfDayReport } from '../types'

export function EndOfDayPage({ eventId }: { eventId: number }) {
  const [report, setReport] = useState<EndOfDayReport | null>(null)

  useEffect(() => {
    getEndOfDay(eventId).then(setReport).catch(() => {})
  }, [eventId])

  return (
    <div style={{ maxWidth: 600 }}>
      <h3>End of Day</h3>

      <section style={{ marginBottom: 24, padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
        <h4 style={{ margin: '0 0 12px' }}>Summary</h4>
        {!report && <p>Loading…</p>}
        {report && (
          <>
            <table style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Sales', `${report.sales_count} sale${report.sales_count !== 1 ? 's' : ''}`],
                  ['Voided', String(report.voided_count)],
                  ['Gross Revenue', `$${report.gross_revenue.toFixed(2)}`],
                  ['MYSL Total', `$${report.mysl_total.toFixed(2)}`],
                  ['Seller Total', `$${report.seller_total.toFixed(2)}`],
                  ['Cash', `$${report.cash_total.toFixed(2)}`],
                  ['Check', `$${report.check_total.toFixed(2)}`],
                  ['Card (Square)', `$${report.cc_total.toFixed(2)}`],
                ].map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #ddd' }}>
                    <td style={{ padding: '4px 24px 4px 8px', fontWeight: 'bold' }}>{label}</td>
                    <td style={{ padding: '4px 8px' }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {(['pdf', 'csv', 'md'] as const).map((fmt) => {
                const label = fmt === 'md' ? 'Markdown' : fmt.toUpperCase()
                const ext = fmt
                return (
                  <button
                    key={fmt}
                    onClick={() => downloadFile(`/reports/${eventId}/end-of-day?format=${fmt}`, `end_of_day_${eventId}.${ext}`)}
                    style={{ padding: '8px 16px', background: '#1a237e', color: 'white', border: 'none', cursor: 'pointer' }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </section>

      <section style={{ padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
        <h4 style={{ margin: '0 0 8px' }}>Database Backup</h4>
        <p style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
          Downloads a ZIP containing the SQLite database and a JSON export.
        </p>
        <button
          onClick={() => downloadFile('/admin/backup', 'ski-swap-backup.zip', 'POST')}
          style={{ padding: '8px 16px', background: '#1a237e', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Download Backup
        </button>
      </section>
    </div>
  )
}
