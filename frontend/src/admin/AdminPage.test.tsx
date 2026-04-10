/**
 * Tests for {@link AdminPage} — covers the admin navigation tab bar:
 * verifies that the default section (Event Setup) renders on mount and that
 * clicking each nav button correctly switches to the Users, Reports, and
 * End of Day sub-sections.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import { AdminPage } from './AdminPage'
import { ADMIN_TOKEN } from '../mocks/tokens'

/**
 * Renders {@link AdminPage} inside an {@link AuthProvider} with an admin session
 * already signed in, so that `decoded.event_id` is available on first render.
 */
function renderWithAuth() {
  function Wrapper() {
    const { signIn } = useAuth()
    // sign in immediately so decoded.event_id is available
    if (!window.__adminTestSigned) {
      window.__adminTestSigned = true
      signIn(ADMIN_TOKEN)
    }
    return <AdminPage />
  }
  // reset flag each render
  window.__adminTestSigned = false
  return render(<AuthProvider><Wrapper /></AuthProvider>)
}

// Extend window type for test flag
declare global { interface Window { __adminTestSigned?: boolean } }

/** Navigation behavior of the AdminPage tab bar. */
describe('AdminPage navigation', () => {
  /** Verifies that Event Setup is the default active section on initial render. */
  it('shows Event Setup by default', async () => {
    renderWithAuth()
    await waitFor(() => expect(screen.getByRole('button', { name: /create event/i })).toBeInTheDocument())
  })

  /** Verifies that clicking the Users tab renders the user creation form. */
  it('navigates to Users section', async () => {
    renderWithAuth()
    fireEvent.click(screen.getByRole('button', { name: /^users$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument())
  })

  /** Verifies that clicking the Reports tab renders the event revenue section. */
  it('navigates to Reports section', async () => {
    renderWithAuth()
    fireEvent.click(screen.getByRole('button', { name: /^reports$/i }))
    await waitFor(() => expect(screen.getByText(/gross revenue/i)).toBeInTheDocument())
  })

  /** Verifies that clicking the End of Day tab renders the database backup button. */
  it('navigates to End of Day section', async () => {
    renderWithAuth()
    fireEvent.click(screen.getByRole('button', { name: /end of day/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /download backup/i })).toBeInTheDocument())
  })
})
