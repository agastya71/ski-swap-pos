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
import { LOOKUP, variantProps } from './posStyles'
import { useUiVariant } from '../lib/uiVariant'

/**
 * Controlled lookup input that supports barcode scanning, partial-code autocomplete,
 * and keyboard navigation for adding items to the POS cart.
 *
 * @param props.focusSignal - Optional counter the parent bumps whenever the scan
 *   field should recapture focus (e.g. the cart changed, so the cashier may have
 *   interacted elsewhere and a barcode scan must not land in another input).
 * @param props.onError - Optional mirror for error messages: LookupField shows
 *   them inline (below the input) AND reports them here so the parent can also
 *   surface them in a top-of-panel banner (event feedback #14 — staff were
 *   looking at the transaction table, not the field, when errors fired).
 */
export function LookupField({ onFound, focusSignal = 0, onError }: { onFound: (item: ItemLookupResponse) => void; focusSignal?: number; onError?: (message: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ItemLookupResponse[] | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const v2 = useUiVariant() === 'v2'

  /** Sets the inline error AND mirrors it to the parent's banner (#14). */
  function showError(message: string | null) {
    setError(message)
    onError?.(message)
  }

  // Keep the scan target focused: on mount AND after every lookup completes.
  // The explicit focus() in handleKeyDown's finally is a NO-OP because the
  // input is still disabled=true in the DOM at that instant (React hasn't
  // re-rendered) — so refocus waits for the `loading` flag to settle.
  // focusSignal bumps (cart changed) also refocus: a cashier who clicked into
  // a cart field and then fires a scanner must not have digits land elsewhere.
  useEffect(() => {
    if (!loading) inputRef.current?.focus()
  }, [loading, focusSignal])

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
      showError(null)
      return
    }

    // Arrow navigation — only when dropdown is open
    if (results && results.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const availableIndices = results
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.remaining > 0)
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

    // Tab in the scan field (#2 keyboard nav): with an open dropdown, Tab
    // selects the highlighted (or first available) item and keeps the cashier
    // on the keyboard — same semantics as Enter-on-highlight. Without a
    // dropdown, Tab keeps its native move-focus-to-the-cart behaviour.
    if (e.key === 'Tab' && results && results.length > 0 && value.trim()) {
      e.preventDefault()
      const available = results.filter(r => r.remaining > 0)
      if (available.length === 0) return
      const target =
        (highlightedIndex !== null && results[highlightedIndex]?.remaining > 0)
          ? results[highlightedIndex]
          : available[0]
      handleSelectResult(target)
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
    showError(null)
    setResults(null)
    setHighlightedIndex(null)
    const code = value.trim()

    try {
      // Fast path: exact match (preserves barcode scanner speed)
      const item = await lookupItem(code)
      if (item.remaining <= 0) {
        showError(`Item ${item.code} is sold out (all ${item.quantity} unit${item.quantity !== 1 ? 's' : ''} sold).`)
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
            showError(`Item not found: ${code}`)
            setValue('')
          } else if (matches.length === 1 && matches[0].remaining > 0) {
            // Single available match — add directly
            onFound(matches[0])
            setValue('')
          } else {
            // Multiple matches — show picker
            setResults(matches)
          }
        } catch {
          showError(`Item not found: ${code}`)
          setValue('')
        }
      } else {
        showError(err instanceof Error ? err.message : 'Lookup failed')
        setValue('')
      }
    } finally {
      setLoading(false)  // refocus happens in the loading-effect (post-rerender)
    }
  }

  /** Closes the dropdown and invokes onFound when an available item is selected from the results list. */
  function handleSelectResult(item: ItemLookupResponse) {
    setResults(null)
    setHighlightedIndex(null)
    setValue('')
    if (item.remaining <= 0) {
      showError(`Item ${item.code} is sold out (all ${item.quantity} unit${item.quantity !== 1 ? 's' : ''} sold).`)
      return
    }
    onFound(item)
    inputRef.current?.focus()
  }

  return (
    <div>
      <label htmlFor="lookup" {...variantProps(v2, 'ui2-pos-lookup-label', LOOKUP.label)}>
        Scan or enter item code:
      </label>
      <input
        id="lookup"
        ref={inputRef}
        value={value}
        onChange={e => { setValue(e.target.value); showError(null) }}
        onKeyDown={handleKeyDown}
        disabled={loading}
        placeholder="Scan barcode, or type partial code + Enter"
        {...variantProps(v2, 'ui2-pos-lookup-input', LOOKUP.input)}
        autoComplete="off"
      />

      {error && (
        <div role="alert" {...variantProps(v2, 'ui2-pos-lookup-error', LOOKUP.error)}>{error}</div>
      )}

      {/* Results list renders INLINE below the input (#3 event feedback) — the
          old position:absolute overlay covered the transaction lines beneath
          it; in document flow nothing is ever hidden, no z-index games. */}
      {results && results.length > 0 && (
        <div {...variantProps(v2, 'ui2-pos-results', LOOKUP.results)}>
          <div {...variantProps(v2, 'ui2-pos-results-head', LOOKUP.resultsHead)}>
            {results.length} item{results.length !== 1 ? 's' : ''} found — click to add to cart
          </div>
          {results.map((item, index) => {
            const isSellable = item.remaining > 0
            const isHighlighted = index === highlightedIndex
            return (
              <button
                key={item.id}
                onClick={isSellable ? () => handleSelectResult(item) : undefined}
                aria-disabled={!isSellable}
                {...variantProps(
                  v2,
                  `ui2-pos-result${isHighlighted ? ' ui2-pos-result--highlighted' : ''}`,
                  LOOKUP.resultRow(isHighlighted, isSellable),
                )}
              >
                <span>
                  <strong {...variantProps(v2, 'ui2-pos-result-code', LOOKUP.resultCode)}>{item.code}</strong>
                  {item.description && <span {...variantProps(v2, 'ui2-pos-result-desc', LOOKUP.resultDesc)}>{item.description}</span>}
                  {(item.category || item.type) && (
                    <span {...variantProps(v2, 'ui2-pos-result-meta', LOOKUP.resultMeta)}>
                        ({[item.category, item.type].filter(Boolean).join(' · ')})
                    </span>
                  )}
                </span>
                <span {...variantProps(v2, 'ui2-pos-result-tail', LOOKUP.resultTail)}>
                  {isSellable && <span {...variantProps(v2, 'ui2-pos-result-remaining', LOOKUP.resultRemaining)}>{item.remaining} left</span>}
                  <strong>${item.price.toFixed(2)}</strong>
                  {!isSellable && (
                    <span {...variantProps(v2, 'ui2-pos-result-status', LOOKUP.resultStatus)}>
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
