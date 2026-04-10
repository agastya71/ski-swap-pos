/**
 * Tests for {@link LoginPage} — covers initial render, successful login flow,
 * error display on failed credentials, and button disabled state while loading.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { ADMIN_TOKEN } from '../mocks/tokens'
import { AuthProvider } from './AuthContext'
import { LoginPage } from './LoginPage'

function renderLogin() {
  const onLogin = vi.fn()
  render(
    <AuthProvider>
      <LoginPage onLogin={onLogin} />
    </AuthProvider>
  )
  return { onLogin }
}

/** LoginPage component integration tests. */
describe('LoginPage', () => {
  /** Verifies that the form fields and submit button are present on initial render. */
  it('renders username, password and sign-in button', () => {
    renderLogin()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  /** Verifies that onLogin is called after the API returns a valid token. */
  it('calls onLogin after successful login', async () => {
    server.use(
      http.post('/auth/login', () =>
        HttpResponse.json({ access_token: ADMIN_TOKEN, role: 'admin', event_id: 1 })
      )
    )
    const { onLogin } = renderLogin()
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin1' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1))
  })

  /** Verifies that an error alert is rendered when the API returns 401. */
  it('shows error alert on failed login', async () => {
    server.use(
      http.post('/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 })
      )
    )
    renderLogin()
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'bad' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i)
    )
  })

  /** Verifies that the sign-in button is disabled while a login request is in-flight. */
  it('disables sign-in button while loading', async () => {
    let resolve!: (v: Response) => void
    const pending = new Promise<Response>(r => { resolve = r })
    server.use(http.post('/auth/login', () => pending))
    renderLogin()
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin1' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
    )
    resolve(new Response(
      JSON.stringify({ access_token: ADMIN_TOKEN, role: 'admin', event_id: 1 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))
  })
})
