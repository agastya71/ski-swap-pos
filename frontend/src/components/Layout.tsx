/**
 * Application shell layout — renders the brand nav bar with the MYSL logo,
 * role-aware navigation links (Intake, Checkout, Admin), the signed-in username
 * and role badge, a Sign Out button, and a footer. Wraps each page's content in a
 * full-height flex container.
 */
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

type Page = 'intake' | 'pos' | 'admin'

const NAVY  = '#1e3a8a'
const BLUE  = '#2563eb'
const WHITE = '#ffffff'

/**
 * Single navigation tab button used inside the Layout header.
 *
 * @param props.label - Text label for the nav link.
 * @param props.active - Whether this link represents the currently visible page.
 * @param props.onClick - Callback invoked when the user clicks the link.
 */
function NavLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? `3px solid ${BLUE}` : '3px solid transparent',
        padding: '0 18px',
        height: 56,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        color: active ? BLUE : '#374151',
        borderRadius: 0,
        letterSpacing: 0,
      }}
    >
      {label}
    </button>
  )
}

/**
 * Full-page layout wrapper that renders the top nav bar and footer around page content.
 * Navigation links are shown or hidden based on the signed-in user's role.
 *
 * @param props.children - Page content rendered inside the main content area.
 * @param props.page - Currently active page identifier used to highlight the correct nav link.
 * @param props.onNavigate - Callback invoked with the target page when a nav link is clicked.
 */
export function Layout({ children, page, onNavigate }: {
  children: ReactNode
  page: Page
  onNavigate: (p: Page) => void
}) {
  const { decoded, signOut } = useAuth()
  const role = decoded?.role

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Brand stripe */}
      <div style={{ height: 4, background: NAVY }} />

      {/* Navigation bar */}
      <header style={{
        background: WHITE,
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 0,
      }}>
        {/* Logo */}
        <div style={{
          fontWeight: 800,
          fontSize: 17,
          color: NAVY,
          letterSpacing: '-0.03em',
          marginRight: 24,
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}>
          ⛷&ensp;Ski Swap POS
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', flex: 1 }}>
          {(role === 'admin' || role === 'intake') && (
            <NavLink label="Intake" active={page === 'intake'} onClick={() => onNavigate('intake')} />
          )}
          {(role === 'admin' || role === 'cashier') && (
            <NavLink label="Checkout" active={page === 'pos'} onClick={() => onNavigate('pos')} />
          )}
          {role === 'admin' && (
            <NavLink label="Admin" active={page === 'admin'} onClick={() => onNavigate('admin')} />
          )}
        </nav>

        {/* User info + Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {decoded?.sub}
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: '#dbeafe',
            color: '#1e40af',
            padding: '3px 7px',
            borderRadius: 3,
          }}>
            {role}
          </span>
          <button
            onClick={signOut}
            style={{
              background: WHITE,
              color: NAVY,
              border: `1px solid ${NAVY}`,
              padding: '5px 14px',
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 4,
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, padding: '28px 32px' }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        background: WHITE,
        borderTop: '1px solid #e2e8f0',
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        color: '#94a3b8',
      }}>
        <span>Minnesota Youth Ski League — Ski Swap POS</span>
        <span>myxc.org</span>
      </footer>
    </div>
  )
}
