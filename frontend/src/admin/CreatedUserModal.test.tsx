/**
 * Tests for {@link CreatedUserModal} — covers credential display and the
 * Dismiss callback.
 *
 * @module CreatedUserModal.test
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { CreatedUserModal } from './CreatedUserModal'

describe('CreatedUserModal', () => {
  it('shows the username and the one-time password', () => {
    render(<CreatedUserModal username="newcashier" password="Generated1!" onClose={vi.fn()} />)
    expect(screen.getByText('newcashier')).toBeInTheDocument()
    expect(screen.getByText('Generated1!')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent(/shown only this once/i)
  })

  /** Dismiss calls onClose so the admin can continue. */
  it('calls onClose when Dismiss is clicked', () => {
    const onClose = vi.fn()
    render(<CreatedUserModal username="newcashier" password="Generated1!" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})