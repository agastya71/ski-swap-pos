import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId: string) => Promise<{
        card: () => Promise<{
          attach: (selector: string) => Promise<void>
          tokenize: () => Promise<{ status: string; token?: string; errors?: { message: string }[] }>
        }>
      }>
    }
  }
}

const SQUARE_APP_ID = import.meta.env.VITE_SQUARE_APP_ID ?? 'sandbox-sq0idb-placeholder'
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID ?? 'placeholder'

export function SquarePayment({ onToken, onError }: {
  onToken: (token: string) => void
  onError: (msg: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<{ tokenize: () => Promise<{ status: string; token?: string; errors?: { message: string }[] }> } | null>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)

  useEffect(() => {
    if (!window.Square) {
      setSdkError('Square SDK unavailable — check internet connection.')
      return
    }
    let mounted = true
    window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID)
      .then(payments => payments.card())
      .then(async card => {
        if (!mounted || !containerRef.current) return
        await card.attach('#square-card-container')
        cardRef.current = card
        setReady(true)
      })
      .catch(err => {
        if (mounted) setSdkError(`Square init failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => { mounted = false }
  }, [])

  async function handleCapture() {
    if (!cardRef.current) return
    setLoading(true)
    try {
      const result = await cardRef.current.tokenize()
      if (result.status === 'OK' && result.token) {
        onToken(result.token)
      } else {
        const msg = result.errors?.map(e => e.message).join(', ') ?? 'Card capture failed'
        onError(msg)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Card capture error')
    } finally {
      setLoading(false)
    }
  }

  if (sdkError) {
    return <p style={{ color: 'orange' }}>⚠ {sdkError}</p>
  }

  return (
    <div>
      <div id="square-card-container" ref={containerRef} style={{ minHeight: 89, border: '1px solid #ccc', padding: 4, marginBottom: 8 }} />
      <button
        type="button"
        onClick={handleCapture}
        disabled={!ready || loading}
        style={{ padding: '8px 20px', background: '#2e7d32', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        {loading ? 'Processing…' : 'Capture Card'}
      </button>
    </div>
  )
}
