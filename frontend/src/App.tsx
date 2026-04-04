import { useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'

import { IntakePage } from './intake/IntakePage'
const POSPage = () => <p>POS module — coming in Phase 6c</p>
const AdminPage = () => <p>Admin module — coming in Phase 6d</p>

type Page = 'intake' | 'pos' | 'admin'

function defaultPage(role: string): Page {
  if (role === 'cashier') return 'pos'
  if (role === 'intake') return 'intake'
  return 'admin'
}

function AppInner() {
  const { decoded } = useAuth()
  const [page, setPage] = useState<Page | null>(null)

  if (!decoded) return <LoginPage onLogin={() => {}} />

  const activePage = page ?? defaultPage(decoded.role)

  return (
    <Layout page={activePage} onNavigate={setPage}>
      {activePage === 'intake' && (
        <ProtectedRoute roles={['admin', 'intake']}><IntakePage /></ProtectedRoute>
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

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
