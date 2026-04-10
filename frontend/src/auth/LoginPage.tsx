/**
 * Login page — credential form for all user roles. Calls the auth API and stores
 * the returned JWT in AuthContext on success.
 */
import { useState, type FormEvent } from 'react'
import { login } from '../api/auth'
import { useAuth } from './AuthContext'

const NAVY = '#1e3a8a'

/**
 * Renders the full-page login form with username/password fields and a submit button.
 * On successful authentication the JWT is stored in {@link AuthContext} and `onLogin` is called.
 *
 * @param props.onLogin - Callback invoked after a successful login response.
 */
export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { signIn } = useAuth()
  /** Current value of the username input field. */
  const [username, setUsername] = useState('')
  /** Current value of the password input field. */
  const [password, setPassword] = useState('')
  /** Error message to display when login fails, or `null` when no error. */
  const [error, setError] = useState<string | null>(null)
  /** Whether a login request is in-flight; used to disable the submit button. */
  const [loading, setLoading] = useState(false)

  /** Submit the login form, call the auth API, and handle success or failure. */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await login(username, password)
      signIn(res.access_token)
      onLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Brand stripe */}
      <div style={{ height: 4, background: NAVY }} />

      {/* Centered card */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '40px 48px',
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        }}>
          {/* Logo / brand */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              fontSize: 30,
              fontWeight: 800,
              color: NAVY,
              letterSpacing: '-0.03em',
              marginBottom: 6,
            }}>
              ⛷ Ski Swap POS
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Minnesota Youth Ski League
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="username" style={{ display: 'block', marginBottom: 5 }}>
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor="password" style={{ display: 'block', marginBottom: 5 }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div role="alert" style={{ marginBottom: 16 }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px',
                background: NAVY,
                color: '#ffffff',
                border: 'none',
                borderRadius: 4,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.01em',
              }}
            >
              Sign In
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '14px 24px',
        textAlign: 'center',
        fontSize: 12,
        color: '#94a3b8',
        borderTop: '1px solid #e2e8f0',
        background: '#ffffff',
      }}>
        Minnesota Youth Ski League — myxc.org
      </div>
    </div>
  )
}
