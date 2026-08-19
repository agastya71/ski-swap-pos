/**
 * Modal form for an authenticated user to change their own password.
 * Re-verifies the current password and enforces the complexity policy
 * (client-side preview + server-side 422). Available to all roles.
 *
 * @module ChangePasswordModal
 */
import { useState, type FormEvent } from 'react'
import { changePassword } from '../api/auth'
import { validatePassword, PASSWORD_MIN_LENGTH } from '../lib/passwordPolicy'

const NAVY = '#1e3a8a'

/**
 * @param props.onClose - Callback invoked when the modal is dismissed or the password is changed.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const policy = validatePassword(newPassword)
  const confirmMismatch = confirm.length > 0 && newPassword !== confirm

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!policy.ok) {
      setError('New password does not meet the requirements.')
      return
    }
    if (newPassword !== confirm) {
      setError('New password and confirmation do not match.')
      return
    }
    if (oldPassword === newPassword) {
      setError('New password must differ from the current password.')
      return
    }
    setLoading(true)
    try {
      await changePassword(oldPassword, newPassword)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password change failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div role="dialog" aria-label="Change password" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', borderRadius: 6, padding: 24, width: 360, boxSizing: 'border-box',
      }}>
        <h3 style={{ marginTop: 0 }}>Change Password</h3>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="oldPassword" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Current Password</label>
          <input id="oldPassword" type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="newPassword" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>New Password</label>
          <input id="newPassword" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required
            minLength={PASSWORD_MIN_LENGTH} style={{ width: '100%', padding: 8, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="confirmPassword" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Confirm New Password</label>
          <input id="confirmPassword" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
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
            {loading ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  )
}