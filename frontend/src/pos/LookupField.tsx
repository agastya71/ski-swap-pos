import { useRef, useEffect, useState, type KeyboardEvent } from 'react'
import { lookupItem } from '../api/items'
import { ApiError } from '../api/client'
import type { ItemLookupResponse } from '../types'

export function LookupField({ onFound }: { onFound: (item: ItemLookupResponse) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !value.trim()) return
    setLoading(true)
    setError(null)
    const code = value.trim()
    try {
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
        setError(`Item not found: ${code}`)
      } else {
        setError(err instanceof Error ? err.message : 'Lookup failed')
      }
      setValue('')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div>
      <label htmlFor="lookup" style={{ fontWeight: 'bold', display: 'block', marginBottom: 4 }}>
        Scan or enter item code:
      </label>
      <input
        id="lookup"
        ref={inputRef}
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        onKeyDown={handleKeyDown}
        disabled={loading}
        placeholder="Scan barcode or type item code + Enter"
        style={{ width: '100%', padding: 12, fontSize: 18, boxSizing: 'border-box', border: '2px solid #1a237e' }}
        autoComplete="off"
      />
      {error && (
        <div role="alert" style={{ color: 'red', marginTop: 6, fontWeight: 'bold' }}>{error}</div>
      )}
    </div>
  )
}
