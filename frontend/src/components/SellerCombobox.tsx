import { useState, useRef, useEffect } from 'react'
import { searchSellers } from '../api/sellers'
import type { Seller } from '../types'
import { useUiVariant } from '../lib/uiVariant'
import { SELLER_COMBOBOX, variantProps } from '../uiStyles'

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
  const v2 = useUiVariant() === 'v2'

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
    <div {...variantProps(v2, 'ui2-combobox', SELLER_COMBOBOX.root)}>
      <input
        role="combobox"
        aria-expanded={results.length > 0}
        value={query}
        onChange={e => { setQuery(e.target.value); setSelected(null) }}
        placeholder={placeholder}
        {...variantProps(v2, 'ui2-combobox-input', SELLER_COMBOBOX.input)}
        autoComplete="off"
      />
      {selected && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="×"
          {...variantProps(v2, 'ui2-combobox-clear', SELLER_COMBOBOX.clearButton)}
        >
          ×
        </button>
      )}
      {results.length > 0 && (
        <div {...variantProps(v2, 'ui2-combobox-list', SELLER_COMBOBOX.dropdown)}>
          {results.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleSelect(s)}
              {...variantProps(v2, 'ui2-combobox-option', SELLER_COMBOBOX.option)}
            >
              <strong {...variantProps(v2, 'ui2-combobox-code', SELLER_COMBOBOX.optionCode)}>
                {s.code}
              </strong>
              {' — '}{s.first_name} {s.last_name}
              {s.company && (
                <span {...variantProps(v2, 'ui2-combobox-company', SELLER_COMBOBOX.optionCompany)}>
                  ({s.company})
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
