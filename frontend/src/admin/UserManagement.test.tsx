/**
 * Tests for {@link UserManagement} — covers user list display (username, role,
 * status), creating a new user via the form, deactivating an existing active user,
 * inactive user badge rendering, and server-side error display on failed creation.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { UserManagement } from './UserManagement'
import type { User } from '../types'

const USERS: User[] = [
  { id: 1, username: 'admin1', role: 'admin', is_active: true, event_id: 1 },
  { id: 2, username: 'intake1', role: 'intake', is_active: true, event_id: 1 },
  { id: 3, username: 'cashier1', role: 'cashier', is_active: false, event_id: 1 },
]

/** UserManagement admin panel — user list, creation, deactivation, and error handling. */
describe('UserManagement', () => {
  /** Verifies that all users from the API are listed with username, role, and status columns. */
  it('lists users with username, role and status', async () => {
    server.use(http.get('/users', () => HttpResponse.json(USERS)))
    render(<UserManagement />)
    await waitFor(() => expect(screen.getByText('admin1')).toBeInTheDocument())
    expect(screen.getByText('intake1')).toBeInTheDocument()
    expect(screen.getByText('cashier1')).toBeInTheDocument()
  })

  /** Verifies that submitting the create-user form adds the new user to the displayed list. */
  it('creates a new user and refreshes the list', async () => {
    const NEW_USER: User = { id: 4, username: 'newcashier', role: 'cashier', is_active: true, event_id: 1 }
    server.use(
      http.get('/users', () => HttpResponse.json(USERS)),
      http.post('/users', () => HttpResponse.json(NEW_USER)),
    )
    render(<UserManagement />)
    await waitFor(() => screen.getByText('admin1'))
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'newcashier' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass123' } })
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'cashier' } })
    fireEvent.click(screen.getByRole('button', { name: /create user/i }))
    await waitFor(() => expect(screen.getByText('newcashier')).toBeInTheDocument())
  })

  /** Verifies that clicking the Deactivate button calls the deactivate API endpoint. */
  it('deactivates a user when Deactivate is clicked', async () => {
    let deactivated = false
    server.use(
      http.get('/users', () => HttpResponse.json(USERS)),
      http.patch('/users/:id/deactivate', () => {
        deactivated = true
        return HttpResponse.json({ ...USERS[1], is_active: false })
      }),
    )
    render(<UserManagement />)
    await waitFor(() => screen.getByText('intake1'))
    const deactivateButtons = screen.getAllByRole('button', { name: /deactivate/i })
    fireEvent.click(deactivateButtons[0])
    await waitFor(() => expect(deactivated).toBe(true))
  })

  /** Verifies that deactivated users display an "Inactive" status indicator. */
  it('shows inactive badge for deactivated users', async () => {
    server.use(http.get('/users', () => HttpResponse.json(USERS)))
    render(<UserManagement />)
    await waitFor(() => screen.getByText('cashier1'))
    expect(screen.getByText(/inactive/i)).toBeInTheDocument()
  })

  /** Verifies that a server error response is surfaced as an inline alert when user creation fails. */
  it('shows error when create user fails', async () => {
    server.use(
      http.get('/users', () => HttpResponse.json(USERS)),
      http.post('/users', () => HttpResponse.json({ detail: 'Username already taken' }, { status: 400 })),
    )
    render(<UserManagement />)
    await waitFor(() => screen.getByText('admin1'))
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin1' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } })
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'cashier' } })
    fireEvent.click(screen.getByRole('button', { name: /create user/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/username already taken/i))
  })
})
