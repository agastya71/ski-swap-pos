/**
 * Admin dashboard page — top-level container for all administrative sub-sections
 * with tab-based navigation.
 *
 * The active section and the open seller live in the URL (`#/admin/...`), so
 * tab switches and list→detail→back navigate through browser history, every
 * section mounts fresh when navigated to, and deep links like `#/admin/sellers/3`
 * address the Sellers section with that seller open.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { EventSetup } from './EventSetup'
import { UserManagement } from './UserManagement'
import { SessionsPanel } from './SessionsPanel'
import { ReportsPage } from './ReportsPage'
import { EndOfDayPage } from './EndOfDayPage'
import { SellerListPage } from './SellerListPage'
import { SellerDetailPage } from './SellerDetailPage'
import { TransactionsPage } from './TransactionsPage'
import { navigate, useHashRoute } from '../lib/useHashRoute'
import { getSeller } from '../api/sellers'
import type { Seller } from '../types'

type AdminSection =
  | 'events'
  | 'users'
  | 'sessions'
  | 'sellers'
  | 'transactions'
  | 'reports'
  | 'eod'

const SECTIONS: { key: AdminSection; label: string; hash: string }[] = [
  { key: 'events', label: 'Event Setup', hash: '/admin/events' },
  { key: 'users', label: 'Users', hash: '/admin/users' },
  { key: 'sessions', label: 'Login Sessions', hash: '/admin/sessions' },
  { key: 'sellers', label: 'Sellers', hash: '/admin/sellers' },
  { key: 'transactions', label: 'Transactions', hash: '/admin/transactions' },
  { key: 'reports', label: 'Reports', hash: '/admin/reports' },
  { key: 'eod', label: 'End of Day', hash: '/admin/eod' },
]

const SECTION_KEYS = SECTIONS.map((s) => s.key)

/** Parses `#/admin/...` into the active section and open seller id (or null). */
function routeForHash(hash: string): {
  section: AdminSection
  sellerId: number | null
} {
  const rest = hash.replace(/^\/admin\/?/, '')
  if (rest.startsWith('sellers')) {
    const id = Number(rest.split('/')[1])
    return {
      section: 'sellers',
      sellerId: Number.isInteger(id) && id > 0 ? id : null,
    }
  }
  // Legacy plain hash (e.g. the bare `#/admin` this page used to set).
  if (rest === '' ) return { section: 'events', sellerId: null }
  const matched = SECTION_KEYS.find((k) => rest.startsWith(k))
  return matched
    ? { section: matched, sellerId: null }
    : { section: 'events', sellerId: null }
}

/**
 * Sellers admin section — the seller list with the detail view addressed by the
 * URL (`#/admin/sellers/{id}`). The seller is fetched fresh per id; deleted or
 * unknown ids surface an error with a way back to the list. View/Back navigate
 * through history, so the browser Back button returns from a detail view.
 */
function SellersSection({ eventId }: { eventId: number }) {
  const hash = useHashRoute()
  const { sellerId } = routeForHash(hash)
  const [detailSeller, setDetailSeller] = useState<Seller | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  /** Which seller id the cached detail state belongs to. */
  const [loadedForId, setLoadedForId] = useState<number | null>(null)

  // URL target changed (list↔detail or another seller): drop the cached detail
  // during render — React's "adjust state on prop change" pattern, which is
  // why no setState runs inside the fetch effect below.
  if (
    (detailSeller !== null || detailError !== null || loadedForId !== null) &&
    loadedForId !== sellerId
  ) {
    setDetailSeller(null)
    setDetailError(null)
    setLoadedForId(null)
  }

  // Fetch the URL-addressed seller once per target id.
  useEffect(() => {
    if (sellerId === null || loadedForId === sellerId) return
    let alive = true
    getSeller(sellerId)
      .then((s) => {
        if (alive) {
          setDetailSeller(s)
          setLoadedForId(sellerId)
        }
      })
      .catch(() => {
        // Error leaves loadedForId unset, so a re-entered detail retries.
        if (alive) setDetailError(`Seller #${sellerId} not found.`)
      })
    return () => {
      alive = false
    }
  }, [sellerId, loadedForId])

  if (sellerId !== null) {
    if (loadedForId === sellerId && detailError) {
      return (
        <div>
          <div role="alert" style={{ color: '#b91c1c', marginBottom: 12 }}>
            {detailError}
          </div>
          <button
            onClick={() => navigate('/admin/sellers')}
            style={{
              border: '1px solid #1e3a8a',
              color: '#1e3a8a',
              background: 'none',
              padding: '6px 14px',
              cursor: 'pointer',
              borderRadius: 3,
            }}
          >
            ← Back to Sellers
          </button>
        </div>
      )
    }
    if (loadedForId === sellerId && detailSeller) {
      return (
        <SellerDetailPage
          key={sellerId}
          seller={detailSeller}
          onBack={() => navigate('/admin/sellers')}
          eventId={eventId}
        />
      )
    }
    return <p style={{ color: '#64748b' }}>Loading seller…</p>
  }
  return (
    <SellerListPage
      onSelectSeller={(s) => navigate(`/admin/sellers/${s.id}`)}
      eventId={eventId}
    />
  )
}

/**
 * Admin dashboard page — top-level container for all administrative sub-sections
 * with tab-based navigation (section tracked in the URL hash).
 */
export function AdminPage() {
  const { decoded } = useAuth()
  const eventId = decoded?.event_id ?? 1
  const hash = useHashRoute()
  const { section } = routeForHash(hash)

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #1a237e', paddingBottom: 8 }}>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => navigate(s.hash)}
            aria-current={section === s.key ? 'page' : undefined}
            style={{
              padding: '6px 16px',
              background: section === s.key ? '#1a237e' : 'transparent',
              color: section === s.key ? 'white' : '#1a237e',
              border: '1px solid #1a237e',
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Keyed by section so a section navigated away-to and back-to remounts
          fresh instead of resuming the previous visit's state. */}
      {section === 'events' && <EventSetup key="events" />}
      {section === 'users' && <UserManagement key="users" />}
      {section === 'sessions' && <SessionsPanel key="sessions" />}
      {section === 'sellers' && <SellersSection key="sellers" eventId={eventId} />}
      {section === 'transactions' && <TransactionsPage key="transactions" />}
      {section === 'reports' && <ReportsPage key="reports" eventId={eventId} />}
      {section === 'eod' && <EndOfDayPage key="eod" eventId={eventId} />}
    </div>
  )
}
