import { useState, useRef, useEffect } from 'react'
import { searchSellers } from '../api/sellers'
import type { Seller } from '../types'

const NAVY = '#1e3a8a'

/**
 * Searchable seller combobox — debounced live search against the sellers API.
 * Shows a dropdown of matching sellers; on selection the seller is passed to onSelect.
 *
 * @param onSelect - Callback invoked with the chosen {@link Seller} record.
 * @param placeholder - Input placeholder text (default: 'Search by name or code...').
 */
export function SellerCombobox({
  onSelect,
  placeholder = 'Search by name or code...',
}: {
  onSelect: (seller: Seller) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Seller[]>([])
  const [selected, setSelected] = useState<Seller | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed || selected) {
      setResults([])
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const matches = await searchSellers(trimmed)
        setResults(matches.slice(0, 10))
      } catch {
        setResults([])
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, selected])

  function handleSelect(seller: Seller) {
    setSelected(seller)
    setQuery(`${seller.code} — ${seller.first_name} ${seller.last_name}`)
    setResults([])
    onSelect(seller)
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    setResults([])
  }

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        role="combobox"
        aria-expanded={results.length > 0}
        value={query}
        onChange={e => { setQuery(e.target.value); setSelected(null) }}
        placeholder={placeholder}
        style={{ flex: 1, padding: '6px 10px', border: `1px solid ${NAVY}`, borderRadius: 4 }}
        autoComplete="off"
      />
      {selected && (
        <button type="button" onClick={handleClear} aria-label="×" style={{ padding: '4px 8px' }}>×</button>
      )}
      {results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.10)', maxHeight: 240, overflowY: 'auto',
        }}>
          {results.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              style={{
                display: 'block', width: '100%', padding: '8px 12px',
                textAlign: 'left', border: 'none', background: 'none',
                borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 14,
              }}
            >
              <strong style={{ color: NAVY }}>{s.code}</strong>
              {' — '}{s.first_name} {s.last_name}
              {s.company && <span style={{ color: '#64748b', marginLeft: 6 }}>({s.company})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
