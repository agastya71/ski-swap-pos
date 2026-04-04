import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

type Role = 'admin' | 'intake' | 'cashier'

export function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { decoded } = useAuth()
  if (!decoded || !roles.includes(decoded.role)) {
    return <p role="alert">Access denied.</p>
  }
  return <>{children}</>
}
