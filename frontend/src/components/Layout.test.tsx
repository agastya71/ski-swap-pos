import { render, screen, fireEvent } from "@testing-library/react"
import { AuthProvider } from '../auth/AuthContext'
import { setToken } from '../api/client'
import { Layout } from './Layout'

/** Build a structurally-valid (unsigned) JWT so jwt-decode can parse it. */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
}

function renderLayout(role: 'admin' | 'cashier' | 'intake' = 'admin') {
  // setToken writes both the in-memory cache and localStorage ('auth_token')
  // — seeding localStorage directly is NOT seen by getToken()'s cache.
  setToken(fakeJwt({ sub: role, role, event_id: 1, exp: 9999999999 }))
  render(
    <AuthProvider>
      <Layout page="admin" onNavigate={() => {}}><div /></Layout>
    </AuthProvider>,
  )
}

describe('Layout', () => {
  it('shows a Change Password button in the header', () => {
    renderLayout()
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument()
  })

  it('opens the change password modal when the button is clicked', () => {
    renderLayout()
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent(/change password/i)
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument()
  })

  it('shows the Documentation tab to every signed-in role', () => {
    renderLayout('cashier')
    expect(screen.getByRole('button', { name: /documentation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /checkout/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /intake/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^admin$/i })).not.toBeInTheDocument()
  })
})
