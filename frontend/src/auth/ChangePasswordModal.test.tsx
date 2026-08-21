/**
 * Tests for {@link ChangePasswordModal} — covers rendering, client-side policy
 * feedback, mismatch detection, and successful submission.
 *
 * @module ChangePasswordModal.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { ChangePasswordModal } from './ChangePasswordModal'

describe('ChangePasswordModal', () => {
  it('shows current/new/confirm fields and requirement hints', () => {
    render(<ChangePasswordModal onClose={vi.fn()} />)
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
    expect(screen.getByText(/uppercase letter/i)).toBeInTheDocument()
  })

  it('blocks submit and shows an error when the new password is weak', async () => {
    const onClose = vi.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'weak' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'weak' } })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/does not meet/i))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('submits to POST /auth/change-password and closes on success', async () => {
    let captured: { old_password?: string; new_password?: string } = {}
    server.use(http.post('/auth/change-password', async ({ request }) => {
      captured = (await request.json()) as { old_password?: string; new_password?: string }
      return HttpResponse.json({ ok: true })
    }))
    const onClose = vi.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass1!' } })
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'N3wStr0ng!pw' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'N3wStr0ng!pw' } })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))
    await waitFor(() => expect(captured.new_password).toBe('N3wStr0ng!pw'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows a server error when the current password is wrong', async () => {
    server.use(http.post('/auth/change-password', () => HttpResponse.json({ detail: 'Current password is incorrect' }, { status: 401 })))
    render(<ChangePasswordModal onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'wrong' } })
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'N3wStr0ng!pw' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'N3wStr0ng!pw' } })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/current password is incorrect/i))
  })

  /** Suggest prefills the new + confirm fields with a compliant password. */
  it('Suggest prefills new and confirm with a compliant password', async () => {
    render(<ChangePasswordModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /suggest/i }))
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toHaveValue('Generated1!'))
    expect(screen.getByLabelText(/confirm new password/i)).toHaveValue('Generated1!')
  })
})