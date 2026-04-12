import { useState, useEffect } from 'react'
import { searchSellers } from '../api/sellers'
import { SellerForm } from '../intake/SellerForm'
import type { Seller } from '../types'

const NAVY = '#1e3a8a'

/**
 * Admin seller list page — debounced search, tabular display, drill-in navigation.
 * Rendered inside the Sellers tab of AdminPage.
 */
export function SellerListPage({ onSelectSeller }: { onSelectSeller: (seller: Seller) => void }) {
  const [query, setQuery] = useState('')
  const [sellers, setSellers] = useState<Seller[]>([])
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      searchSellers(query).then(setSellers).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  function handleCreated(seller: Seller) {
    setShowCreate(false)
    setSellers(prev => [...prev, seller].sort((a, b) => a.code.localeCompare(b.code)))
  }

  if (showCreate) {
    return <SellerForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Sellers</h3>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: NAVY, color: '#fff', border: 'none', padding: '6px 14px', cursor: 'pointer', borderRadius: 4 }}
        >
          Register New Seller
        </button>
      </div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by name or code..."
        style={{ width: '100%', padding: '8px 10px', marginBottom: 12, border: `1px solid ${NAVY}`, borderRadius: 4, boxSizing: 'border-box' }}
      />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            {['Code', 'Name', 'Phone', 'Email', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sellers.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 10px', fontWeight: 600, color: NAVY }}>{s.code}</td>
              <td style={{ padding: '8px 10px' }}>{s.first_name} {s.last_name}{s.company ? ` (${s.company})` : ''}</td>
              <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.phone ?? '—'}</td>
              <td style={{ padding: '8px 10px', color: '#64748b' }}>{s.email ?? '—'}</td>
              <td style={{ padding: '8px 10px' }}>
                <button
                  onClick={() => onSelectSeller(s)}
                  style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '3px 10px', cursor: 'pointer', borderRadius: 3 }}
                >
                  View →
                </button>
              </td>
            </tr>
          ))}
          {sellers.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No sellers found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
