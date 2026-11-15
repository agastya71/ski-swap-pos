/**
 * Tests for {@link SessionsPanel} — covers session list rendering (user,
 * timestamps, IP, device, status), revoking a single session, bulk-verifying
 * the revoke-all confirmation flow, and the empty-state message.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { SessionsPanel } from './SessionsPanel'
import type { LoginSession } from '../types'

const SESSIONS: LoginSession[] = [
  {
    id: 11,
    user_id: 1,
    username: 'admin',
    role: 'admin',
    event_id: 1,
    created_at: '2026-11-15T08:00:00Z',
    last_seen_at: '2026-11-15T08:30:00Z',
    revoked_at: null,
    revoked_by: null,
    login_ip: '192.168.4.50',
    user_agent: 'Mozilla/5.0 Chrome',
  },
  {
    id: 12,
    user_id: 2,
    username: 'cashier1',
    role: 'cashier',
    event_id: 1,
    created_at: '2026-11-14T09:00:00Z',
    last_seen_at: '2026-11-14T09:05:00Z',
    revoked_at: '2026-11-14T10:00:00Z',
    revoked_by: 'admin',
    login_ip: '192.168.4.61',
    user_agent: 'Safari',
  },
]

/** SessionsPanel admin table — listing, revocation, and empty state. */
describe('SessionsPanel', () => {
  /** Verifies sessions are listed with user, IP, device, and status. */
  it('lists sessions with user, ip, device and status', async () => {
    server.use(http.get('/auth/sessions', () => HttpResponse.json(SESSIONS)))
    render(<SessionsPanel />)
    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument())
    expect(screen.getByText('cashier1')).toBeInTheDocument()
    expect(screen.getByText('192.168.4.50')).toBeInTheDocument()
    expect(screen.getByText('Mozilla/5.0 Chrome')).toBeInTheDocument()
    // Revoked row shows who revoked it; live row shows Active.
    expect(screen.getByText(/Revoked by admin/i)).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  /** Verifies clicking Revoke calls the revoke endpoint and refreshes the list. */
  it('revokes a session when Revoke is clicked', async () => {
    let revoked = false
    server.use(
      http.get('/auth/sessions', () =>
        HttpResponse.json(
          revoked
            ? [{ ...SESSIONS[0], revoked_at: '2026-11-15T09:00:00Z', revoked_by: 'admin' }]
            : [SESSIONS[0]],
        ),
      ),
      http.post('/auth/sessions/11/revoke', () => {
        revoked = true
        return HttpResponse.json({ ok: true })
      }),
    )
    render(<SessionsPanel />)
    await waitFor(() => screen.getByText('admin'))
    fireEvent.click(screen.getByRole('button', { name: /revoke session 11 for admin/i }))
    await waitFor(() => expect(screen.getByText(/Revoked by admin/i)).toBeInTheDocument())
  })

  /** Verifies confirming the bulk-revoke dialog calls the per-user endpoint. */
  it('revokes all sessions for a user after confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    let bulkDone = false
    server.use(
      http.get('/auth/sessions', () =>
        HttpResponse.json(bulkDone ? [{ ...SESSIONS[0], revoked_at: '2026-11-15T09:00:00Z', revoked_by: 'admin' }] : [SESSIONS[0]]),
      ),
      http.post('/auth/users/1/revoke-sessions', () => {
        bulkDone = true
        return HttpResponse.json({ ok: true, revoked: 1 })
      }),
    )
    render(<SessionsPanel />)
    await waitFor(() => screen.getByText('admin'))
    fireEvent.click(screen.getByRole('button', { name: /revoke all sessions for admin/i }))
    await waitFor(() => expect(screen.getByText(/Revoked by admin/i)).toBeInTheDocument())
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/revoke all 1 live session/i))
    confirmSpy.mockRestore()
  })

  /** Verifies the empty-state message renders when no sessions exist. */
  it('shows empty state when no sessions', async () => {
    server.use(http.get('/auth/sessions', () => HttpResponse.json([])))
    render(<SessionsPanel />)
    await waitFor(() => expect(screen.getByText(/no sessions recorded yet/i)).toBeInTheDocument())
  })

  /** Verifies a failed revoke surfaces the error message. */
  it('shows an error when revoke fails', async () => {
    server.use(
      http.get('/auth/sessions', () => HttpResponse.json([SESSIONS[0]])),
      http.post('/auth/sessions/11/revoke', () =>
        HttpResponse.json({ detail: 'Session not found' }, { status: 404 }),
      ),
    )
    render(<SessionsPanel />)
    await waitFor(() => screen.getByText('admin'))
    fireEvent.click(screen.getByRole('button', { name: /revoke session 11 for admin/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/session not found/i))
  })
})
