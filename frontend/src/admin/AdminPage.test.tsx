import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import { AdminPage } from './AdminPage'
import { ADMIN_TOKEN } from '../mocks/tokens'

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

describe('AdminPage navigation', () => {
  it('shows Event Setup by default', async () => {
    renderWithAuth()
    await waitFor(() => expect(screen.getByRole('button', { name: /create event/i })).toBeInTheDocument())
  })

  it('navigates to Users section', async () => {
    renderWithAuth()
    fireEvent.click(screen.getByRole('button', { name: /^users$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument())
  })

  it('navigates to Reports section', async () => {
    renderWithAuth()
    fireEvent.click(screen.getByRole('button', { name: /^reports$/i }))
    await waitFor(() => expect(screen.getByText(/gross revenue/i)).toBeInTheDocument())
  })

  it('navigates to End of Day section', async () => {
    renderWithAuth()
    fireEvent.click(screen.getByRole('button', { name: /end of day/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /download backup/i })).toBeInTheDocument())
  })
})
