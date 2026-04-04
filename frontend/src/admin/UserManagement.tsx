import { useState, useEffect, type FormEvent } from 'react'
import { getUsers, createUser, deactivateUser } from '../api/users'
import type { User } from '../types'

type Role = 'admin' | 'intake' | 'cashier'

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('cashier')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    const data = await getUsers()
    setUsers(data)
  }

  useEffect(() => { load().catch(() => {}) }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const created = await createUser({ username, password, role })
      setUsers(prev => [...prev, created])
      setUsername('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

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
              <td style={{ padding: '6px 8px' }}>
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
          <input id="newPassword" type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: 6, boxSizing: 'border-box' }} />
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
    </div>
  )
}
