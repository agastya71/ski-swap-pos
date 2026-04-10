/**
 * Admin dashboard page — top-level container for all administrative sub-sections
 * (Event Setup, Users, Reports, End of Day), rendered for admin-role users only.
 */

import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { EventSetup } from './EventSetup'
import { UserManagement } from './UserManagement'
import { ReportsPage } from './ReportsPage'
import { EndOfDayPage } from './EndOfDayPage'

/** Union type of the available admin sub-section keys. */
type AdminSection = 'events' | 'users' | 'reports' | 'eod'

/** Ordered list of admin navigation tabs with their display labels. */
const SECTIONS: { key: AdminSection; label: string }[] = [
  { key: 'events', label: 'Event Setup' },
  { key: 'users', label: 'Users' },
  { key: 'reports', label: 'Reports' },
  { key: 'eod', label: 'End of Day' },
]

/**
 * Top-level admin dashboard that renders a tab bar and conditionally mounts
 * one of four admin sub-section components based on the active tab.
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
      {section === 'reports' && <ReportsPage eventId={eventId} />}
      {section === 'eod' && <EndOfDayPage eventId={eventId} />}
    </div>
  )
}
