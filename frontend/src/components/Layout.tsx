import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

type Page = 'intake' | 'pos' | 'admin'

export function Layout({ children, page, onNavigate }: {
  children: ReactNode
  page: Page
  onNavigate: (p: Page) => void
}) {
  const { decoded, signOut } = useAuth()
  const role = decoded?.role

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <header style={{ background: '#1a237e', color: 'white', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <strong>Ski Swap POS</strong>
        <nav style={{ display: 'flex', gap: 8, flex: 1 }}>
          {(role === 'admin' || role === 'intake') && (
            <button
              onClick={() => onNavigate('intake')}
              aria-current={page === 'intake' ? 'page' : undefined}
              style={{ background: page === 'intake' ? 'white' : 'transparent', color: page === 'intake' ? '#1a237e' : 'white', border: '1px solid white', padding: '4px 12px', cursor: 'pointer' }}
            >
              Intake
            </button>
          )}
          {(role === 'admin' || role === 'cashier') && (
            <button
              onClick={() => onNavigate('pos')}
              aria-current={page === 'pos' ? 'page' : undefined}
              style={{ background: page === 'pos' ? 'white' : 'transparent', color: page === 'pos' ? '#1a237e' : 'white', border: '1px solid white', padding: '4px 12px', cursor: 'pointer' }}
            >
              POS
            </button>
          )}
          {role === 'admin' && (
            <button
              onClick={() => onNavigate('admin')}
              aria-current={page === 'admin' ? 'page' : undefined}
              style={{ background: page === 'admin' ? 'white' : 'transparent', color: page === 'admin' ? '#1a237e' : 'white', border: '1px solid white', padding: '4px 12px', cursor: 'pointer' }}
            >
              Admin
            </button>
          )}
        </nav>
        <span style={{ fontSize: 14 }}>{decoded?.sub} ({role})</span>
        <button onClick={signOut} style={{ background: 'transparent', color: 'white', border: '1px solid white', padding: '4px 12px', cursor: 'pointer' }}>
          Sign Out
        </button>
      </header>
      <main style={{ padding: 16 }}>{children}</main>
    </div>
  )
}
