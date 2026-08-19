/**
 * Modal form for an admin to reset a user's password. Enforces the complexity
 * policy (client preview + server 422). The admin does not need the user's
 * current password.
 *
 * @module ResetPasswordModal
 */
import { useState, type FormEvent } from 'react'
import { resetUserPassword } from '../api/users'
import { validatePassword, PASSWORD_MIN_LENGTH } from '../lib/passwordPolicy'
import type { User } from '../types'

const NAVY = '#1e3a8a'

/**
 * @param props.user - The user whose password is being reset.
 * @param props.onClose - Callback invoked on dismiss or success.
 */
export function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const policy = validatePassword(newPassword)
  const confirmMismatch = confirm.length > 0 && newPassword !== confirm

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!policy.ok) { setError('New password does not meet the requirements.'); return }
    if (newPassword !== confirm) { setError('Password and confirmation do not match.'); return }
    setLoading(true)
    try {
      await resetUserPassword(user.id, newPassword)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div role="dialog" aria-label={`Reset password for ${user.username}`} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 6, padding: 24, width: 360, boxSizing: 'border-box' }}>
        <h3 style={{ marginTop: 0 }}>Reset Password — {user.username}</h3>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="resetNewPassword" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>New Password</label>
          <input id="resetNewPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required
            minLength={PASSWORD_MIN_LENGTH} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="resetConfirmPassword" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Confirm New Password</label>
          <input id="resetConfirmPassword" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
          {confirmMismatch && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>Passwords do not match.</div>}
        </div>
        <ul style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', paddingLeft: 20 }}>
          {policy.errors.map(req => <li key={req} style={{ color: '#ef4444' }}>{req}</li>)}
          {policy.ok && newPassword.length > 0 && <li style={{ color: '#16a34a' }}>Password meets all requirements.</li>}
        </ul>
        {error && <div role="alert" style={{ color: '#ef4444', marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px' }}>Cancel</button>
          <button type="submit" disabled={loading}
            style={{ padding: '8px 16px', background: NAVY, color: '#fff', border: 'none', cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Saving…' : 'Reset Password'}
          </button>
        </div>
      </form>
    </div>
  )
}