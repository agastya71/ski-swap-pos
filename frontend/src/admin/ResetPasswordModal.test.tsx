/**
 * Tests for {@link ResetPasswordModal} — covers rendering, the Suggest button
 * prefilling a compliant password, and successful submission to the reset API.
 *
 * @module ResetPasswordModal.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { ResetPasswordModal } from './ResetPasswordModal'
import type { User } from '../types'

const TARGET: User = { id: 2, username: 'intake1', role: 'intake', is_active: true, event_id: 1 }

describe('ResetPasswordModal', () => {
  it('renders the dialog for the target user', () => {
    render(<ResetPasswordModal user={TARGET} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent(/intake1/i)
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
  })

  /** Suggest prefills both fields with a compliant password (admin can accept or edit). */
  it('Suggest prefills new and confirm with a compliant password', async () => {
    render(<ResetPasswordModal user={TARGET} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /suggest/i }))
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toHaveValue('Generated1!'))
    expect(screen.getByLabelText(/confirm new password/i)).toHaveValue('Generated1!')
  })

  /** Accepting the suggested password and submitting hits the reset endpoint. */
  it('submits the suggested password to the reset endpoint', async () => {
    let captured: { new_password?: string } = {}
    server.use(http.post('/users/:id/reset-password', async ({ request }) => {
      captured = (await request.json()) as { new_password?: string }
      return HttpResponse.json({ ok: true })
    }))
    const onClose = vi.fn()
    render(<ResetPasswordModal user={TARGET} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /suggest/i }))
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toHaveValue('Generated1!'))
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    await waitFor(() => expect(captured.new_password).toBe('Generated1!'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})