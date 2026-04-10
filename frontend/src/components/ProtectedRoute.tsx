/**
 * Route guard that redirects unauthenticated users to /login before rendering protected content.
 */
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

type Role = 'admin' | 'intake' | 'cashier'

/**
 * Renders `children` only when the signed-in user's role is included in `roles`.
 * Displays an "Access denied." alert paragraph for unauthenticated or unauthorized users.
 *
 * @param props.roles - List of roles permitted to view the wrapped content.
 * @param props.children - Content to render when access is granted.
 */
export function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { decoded } = useAuth()
  if (!decoded || !roles.includes(decoded.role)) {
    return <p role="alert">Access denied.</p>
  }
  return <>{children}</>
}
