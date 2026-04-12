import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { EventSetup } from './EventSetup'
import { UserManagement } from './UserManagement'
import { ReportsPage } from './ReportsPage'
import { EndOfDayPage } from './EndOfDayPage'
import { SellerListPage } from './SellerListPage'
import { SellerDetailPage } from './SellerDetailPage'
import type { Seller } from '../types'

type AdminSection = 'events' | 'users' | 'reports' | 'eod' | 'sellers'

const SECTIONS: { key: AdminSection; label: string }[] = [
  { key: 'events', label: 'Event Setup' },
  { key: 'users', label: 'Users' },
  { key: 'sellers', label: 'Sellers' },
  { key: 'reports', label: 'Reports' },
  { key: 'eod', label: 'End of Day' },
]

/** SellersSection manages its own list↔detail navigation state. */
function SellersSection({ eventId }: { eventId: number }) {
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)
  if (selectedSeller) {
    return <SellerDetailPage seller={selectedSeller} onBack={() => setSelectedSeller(null)} eventId={eventId} />
  }
  return <SellerListPage onSelectSeller={setSelectedSeller} eventId={eventId} />
}

/**
 * Admin dashboard page — top-level container for all administrative sub-sections
 * with tab-based navigation.
 */
export function AdminPage() {
  const { decoded } = useAuth()
  const eventId = decoded?.event_id ?? 1
  const [section, setSection] = useState<AdminSection>('events')

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #1a237e', paddingBottom: 8 }}>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
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

      {section === 'events' && <EventSetup />}
      {section === 'users' && <UserManagement />}
      {section === 'sellers' && <SellersSection eventId={eventId} />}
      {section === 'reports' && <ReportsPage eventId={eventId} />}
      {section === 'eod' && <EndOfDayPage eventId={eventId} />}
    </div>
  )
}
