/**
 * Item code lookup field for the POS checkout screen. Supports three input modes:
 * (1) barcode scanner — fires lookupItem (exact match) on Enter,
 * (2) partial code typing — fires searchItems with 300 ms debounce and shows autocomplete dropdown,
 * (3) keyboard navigation — ArrowUp/Down to highlight, Enter to select, Escape to dismiss.
 *
 * @module LookupField
 */
import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { lookupItem, searchItems } from '../api/items'
import { ApiError } from '../api/client'
import type { ItemLookupResponse } from '../types'

const NAVY = '#1e3a8a'
const HIGHLIGHT_BG = '#e8eef9'

/**
 * Controlled lookup input that supports barcode scanning, partial-code autocomplete,
 * and keyboard navigation for adding items to the POS cart.
 *
 * @param props.onFound - Callback invoked with a found available item so the parent
 *   can append it to the cart.
 */
export function LookupField({ onFound }: { onFound: (item: ItemLookupResponse) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ItemLookupResponse[] | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const trimmed = value.trim()
    if (trimmed.length < 3) {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      setResults(null)
      setHighlightedIndex(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const matches = await searchItems(trimmed)
        setResults(matches.length > 0 ? matches : null)
        setHighlightedIndex(null)
      } catch {
        // silently ignore search errors — Enter path shows explicit errors
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  /** Handles Escape (dismiss), ArrowUp/Down (highlight navigation), and Enter (select or exact lookup). */
  async function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setResults(null)
      setHighlightedIndex(null)
      setError(null)
      return
    }

    // Arrow navigation — only when dropdown is open
    if (results && results.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const availableIndices = results
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.status === 'available')
        .map(({ i }) => i)

      if (availableIndices.length === 0) return

      if (e.key === 'ArrowDown') {
        const next = availableIndices.find(i => i > (highlightedIndex ?? -1))
        setHighlightedIndex(next !== undefined ? next : availableIndices[0])
      } else {
        const prev = [...availableIndices].reverse().find(i => i < (highlightedIndex ?? results.length))
        setHighlightedIndex(prev !== undefined ? prev : availableIndices[availableIndices.length - 1])
      }
      return
    }

    if (e.key !== 'Enter' || !value.trim()) return

    // Cancel any pending debounced search
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // If a result is highlighted, select it without firing a lookup
    if (highlightedIndex !== null && results) {
      const item = results[highlightedIndex]
      if (item) {
        handleSelectResult(item)
        return
      }
    }

    // Barcode scanner / manual Enter — exact lookup fast path (unchanged)
    setLoading(true)
    setError(null)
    setResults(null)
    setHighlightedIndex(null)
    const code = value.trim()

    try {
      // Fast path: exact match (preserves barcode scanner speed)
      const item = await lookupItem(code)
      if (item.status !== 'available') {
        setError(`Item ${item.code} is already ${item.status}.`)
        setValue('')
        return
      }
      onFound(item)
      setValue('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Fall back to partial code search
        try {
          const matches = await searchItems(code)
          if (matches.length === 0) {
            setError(`Item not found: ${code}`)
            setValue('')
          } else if (matches.length === 1 && matches[0].status === 'available') {
            // Single available match — add directly
            onFound(matches[0])
            setValue('')
          } else {
            // Multiple matches — show picker
            setResults(matches)
          }
        } catch {
          setError(`Item not found: ${code}`)
          setValue('')
        }
      } else {
        setError(err instanceof Error ? err.message : 'Lookup failed')
        setValue('')
      }
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  /** Closes the dropdown and invokes onFound when an available item is selected from the results list. */
  function handleSelectResult(item: ItemLookupResponse) {
    setResults(null)
    setHighlightedIndex(null)
    setValue('')
    if (item.status !== 'available') {
      setError(`Item ${item.code} is already ${item.status}.`)
      return
    }
    onFound(item)
    inputRef.current?.focus()
  }

  return (
    <div style={{ position: 'relative' }}>
      <label htmlFor="lookup" style={{ fontWeight: 600, display: 'block', marginBottom: 4, fontSize: 14 }}>
        Scan or enter item code:
      </label>
      <input
        id="lookup"
        ref={inputRef}
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        onKeyDown={handleKeyDown}
        disabled={loading}
        placeholder="Scan barcode, or type partial code + Enter"
        style={{ width: '100%', padding: 12, fontSize: 18, boxSizing: 'border-box', border: `2px solid ${NAVY}`, borderRadius: 4 }}
        autoComplete="off"
      />

      {error && (
        <div role="alert" style={{ marginTop: 6 }}>{error}</div>
      )}

      {results && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          zIndex: 20,
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          <div style={{ padding: '7px 12px', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>
            {results.length} item{results.length !== 1 ? 's' : ''} found — click to add to cart
          </div>
          {results.map((item, index) => {
            const isAvailable = item.status === 'available'
            const isHighlighted = index === highlightedIndex
            return (
              <button
                key={item.id}
                onClick={isAvailable ? () => handleSelectResult(item) : undefined}
                aria-disabled={!isAvailable}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  background: isHighlighted ? HIGHLIGHT_BG : 'none',
                  border: 'none',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: isAvailable ? 'pointer' : 'default',
                  fontSize: 14,
                  textAlign: 'left',
                  opacity: isAvailable ? 1 : 0.45,
                  pointerEvents: isAvailable ? 'auto' : 'none',
                }}
              >
                <span>
                  <strong style={{ color: NAVY, marginRight: 8 }}>{item.code}</strong>
                  {item.description && <span style={{ color: '#374151' }}>{item.description}</span>}
                  {item.category && <span style={{ marginLeft: 6, fontSize: 12, color: '#94a3b8' }}>({item.category})</span>}
                </span>
                <span style={{ whiteSpace: 'nowrap', marginLeft: 16 }}>
                  <strong>${item.price.toFixed(2)}</strong>
                  {!isAvailable && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: '#ef4444', fontWeight: 700, textTransform: 'uppercase' }}>
                      {item.status}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
