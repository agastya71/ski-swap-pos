/**
 * User management admin panel — lists all event user accounts, allows admins to
 * create new users with a chosen role, and deactivate existing accounts.
 */

import { useState, useEffect, type FormEvent } from 'react'
import { getUsers, createUser, deactivateUser } from '../api/users'
import { generatePassword } from '../api/auth'
import { ResetPasswordModal } from './ResetPasswordModal'
import { CreatedUserModal } from './CreatedUserModal'
import type { User } from '../types'

/** Permitted role values for event user accounts. */
type Role = 'admin' | 'intake' | 'cashier'

/**
 * Admin panel for managing event user accounts: displays the user table with
 * deactivation controls and a form to create new users.
 */
export function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [role, setRole] = useState<Role>('cashier')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  // Credentials of the most recently created user, shown once in a popup.
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)

  /** Fetches all event users from the API and updates local state. */
  async function load() {
    const data = await getUsers()
    setUsers(data)
  }

  /** Prefills the password field with a compliant generated default. */
  async function fillGeneratedPassword() {
    try {
      setPassword(await generatePassword())
    } catch {
      // Leave the field empty; the admin can still type a password manually.
    }
  }

  useEffect(() => {
    load().catch(() => {})
    fillGeneratedPassword()
  }, [])

  /** Submits the create-user form; on success shows the credentials once. */
  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await createUser({ username, password, role })
      setCreated({ username, password })
      await load()
      setUsername('')
      setPassword('')
      fillGeneratedPassword() // prefill a fresh default for the next user
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  /** Deactivates the user with the given ID and updates that row in the local list. */
  async function handleDeactivate(id: number) {
    const updated = await deactivateUser(id)
    setUsers(prev => prev.map(u => u.id === id ? updated : u))
  }

  return (
    <div>
      <h3>Users</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Username</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Role</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 8px' }}>{u.username}</td>
              <td style={{ padding: '6px 8px' }}>{u.role}</td>
              <td style={{ padding: '6px 8px' }}>{u.is_active ? 'Active' : <em>Inactive</em>}</td>
              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                <button onClick={() => setResetTarget(u)} style={{ marginRight: 6 }}>Reset Password</button>
                {u.is_active && (
                  <button onClick={() => handleDeactivate(u.id)}>Deactivate</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Create New User</h4>
      <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <div>
          <label htmlFor="newUsername" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Username</label>
          <input id="newUsername" value={username} onChange={e => setUsername(e.target.value)} required style={{ width: '100%', padding: 6, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="newPassword" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Password</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input id="newPassword" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required style={{ flex: 1, padding: 6, boxSizing: 'border-box' }} />
            <button type="button" onClick={() => fillGeneratedPassword()} title="Generate a compliant password" style={{ padding: '6px 10px' }}>Generate</button>
            <button type="button" onClick={() => setShowPw(s => !s)} title={showPw ? 'Hide password' : 'Show password'} style={{ padding: '6px 10px' }}>{showPw ? 'Hide' : 'Show'}</button>
          </div>
        </div>
        <div>
          <label htmlFor="newRole" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Role</label>
          <select id="newRole" value={role} onChange={e => setRole(e.target.value as Role)} style={{ width: '100%', padding: 6 }}>
            <option value="cashier">Cashier</option>
            <option value="intake">Intake</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={loading}>Create User</button>
      </form>
      {error && <div role="alert" style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
      {created && (
        <CreatedUserModal
          username={created.username}
          password={created.password}
          onClose={() => setCreated(null)}
        />
      )}
    </div>
  )
}
