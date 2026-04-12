/**
 * Root application component — mounts AuthProvider, BrowserRouter, and top-level routes
 * mapping paths to module pages.
 */
import { useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'

import { IntakeModulePage } from './intake/IntakeModulePage'
import { POSPage } from './pos/POSPage'
import { AdminPage } from './admin/AdminPage'

type Page = 'intake' | 'pos' | 'admin'

/** Returns the default landing page for a given user role. */
function defaultPage(role: string): Page {
  if (role === 'cashier') return 'pos'
  if (role === 'intake') return 'intake'
  return 'admin'
}

/**
 * Inner application shell rendered after auth context is available.
 * Shows the login page when unauthenticated, otherwise renders the
 * role-appropriate page inside the shared Layout.
 */
function AppInner() {
  const { decoded } = useAuth()
  const [page, setPage] = useState<Page | null>(null)

  if (!decoded) return <LoginPage onLogin={() => {}} />

  const activePage = page ?? defaultPage(decoded.role)

  return (
    <Layout page={activePage} onNavigate={setPage}>
      {activePage === 'intake' && (
        <ProtectedRoute roles={['admin', 'intake']}><IntakeModulePage /></ProtectedRoute>
      )}
      {activePage === 'pos' && (
        <ProtectedRoute roles={['admin', 'cashier']}><POSPage /></ProtectedRoute>
      )}
      {activePage === 'admin' && (
        <ProtectedRoute roles={['admin']}><AdminPage /></ProtectedRoute>
      )}
    </Layout>
  )
}

/**
 * Top-level component that wraps the entire app in {@link AuthProvider}
 * and renders {@link AppInner}.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
