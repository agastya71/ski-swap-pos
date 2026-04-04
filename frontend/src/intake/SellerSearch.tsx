import { useState, useEffect } from 'react'
import { searchSellers } from '../api/sellers'
import type { Seller } from '../types'

export function SellerSearch({ onSelect, onCreateNew }: {
  onSelect: (seller: Seller) => void
  onCreateNew: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Seller[] | null>(null)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults(null); setSearched(false); return }
    const t = setTimeout(async () => {
      const data = await searchSellers(query.trim())
      setResults(data)
      setSearched(true)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div>
      <input
        placeholder="Search by name or code"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }}
      />
      {searched && results !== null && results.length === 0 && (
        <p>No sellers found.</p>
      )}
      {results && results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {results.map(s => (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s)}
                style={{ width: '100%', textAlign: 'left', padding: 8, cursor: 'pointer', background: 'none', border: '1px solid #ccc', marginBottom: 4 }}
              >
                {s.first_name} {s.last_name} — {s.code}
                {s.company && ` (${s.company})`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={onCreateNew} style={{ marginTop: 8 }}>Register New Seller</button>
    </div>
  )
}
