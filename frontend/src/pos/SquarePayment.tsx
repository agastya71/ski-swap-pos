/**
 * Square Web Payments SDK integration — renders the Square card entry iframe and
 * tokenizes card details for use in sale submission. Degrades gracefully when the
 * Square SDK is unavailable (e.g. network blocked in testing).
 *
 * @module SquarePayment
 */
import { Component, useEffect, useRef, useState, type ReactNode } from 'react'

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

const SQUARE_APP_ID = import.meta.env.VITE_SQUARE_APP_ID ?? ''
const SQUARE_LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID ?? ''
const INIT_TIMEOUT_MS = 8000

class SquareErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }
  static getDerivedStateFromError() { return { crashed: true } }
  render() {
    if (this.state.crashed) {
      return <p style={{ color: 'orange', margin: 0 }}>Card payment unavailable. Use cash or check below.</p>
    }
    return this.props.children
  }
}

function SquarePaymentInner({ onToken, onError }: {
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
      setSdkError('Square SDK not loaded. Use cash or check below.')
      return
    }
    if (!SQUARE_APP_ID || !SQUARE_LOCATION_ID) {
      setSdkError('Square credentials not configured. Use cash or check below.')
      return
    }

    let mounted = true
    const timeoutId = setTimeout(() => {
      if (mounted && !cardRef.current) {
        setSdkError('Square connection timed out. Use cash or check below.')
      }
    }, INIT_TIMEOUT_MS)

    try {
      window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID)
        .then(payments => payments.card())
        .then(async card => {
          if (!mounted || !containerRef.current) return
          await card.attach('#square-card-container')
          cardRef.current = card
          clearTimeout(timeoutId)
          setReady(true)
        })
        .catch(err => {
          clearTimeout(timeoutId)
          if (mounted) setSdkError('Card payment unavailable. Use cash or check below.')
          onError(err instanceof Error ? err.message : String(err))
        })
    } catch (err) {
      clearTimeout(timeoutId)
      if (mounted) setSdkError('Card payment unavailable. Use cash or check below.')
    }

    return () => {
      mounted = false
      clearTimeout(timeoutId)
    }
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
    return <p style={{ color: 'orange', margin: 0 }}>{sdkError}</p>
  }

  return (
    <div>
      <div id="square-card-container" ref={containerRef} style={{ minHeight: 89, border: '1px solid #ccc', padding: 4, marginBottom: 8 }} />
      <button
        type="button"
        onClick={handleCapture}
        disabled={!ready || loading}
        style={{ padding: '8px 20px', background: '#2e7d32', color: 'white', border: 'none', cursor: ready ? 'pointer' : 'not-allowed' }}
      >
        {loading ? 'Processing…' : ready ? 'Capture Card' : 'Connecting to Square…'}
      </button>
    </div>
  )
}

/**
 * Public wrapper that mounts the Square card iframe inside a React error boundary.
 * Falls back to an inline error message if the SDK is unavailable or throws.
 *
 * @param props.onToken - Callback invoked with the Square nonce string after successful card capture.
 * @param props.onError - Callback invoked with a human-readable error message when card capture fails.
 */
export function SquarePayment(props: { onToken: (token: string) => void; onError: (msg: string) => void }) {
  return (
    <SquareErrorBoundary>
      <SquarePaymentInner {...props} />
    </SquareErrorBoundary>
  )
}
