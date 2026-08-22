/**
 * Tests for {@link CreatedUserModal} — covers credential display and the
 * Dismiss callback.
 *
 * @module CreatedUserModal.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  /** Copy confirms when the async Clipboard API is available. */
  it('Copy confirms when the clipboard is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    try {
      render(<CreatedUserModal username="newcashier" password="Generated1!" onClose={vi.fn()} />)
      fireEvent.click(screen.getAllByRole('button', { name: /^copy$/i })[1]) // password Copy
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('Generated1!'))
      await waitFor(() => expect(screen.getByRole('button', { name: /^copied$/i })).toBeInTheDocument())
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    }
  })

  /** Copy surfaces a visible error (instead of failing silently) when the
   *  clipboard is unavailable, so the admin knows to copy manually. */
  it('Copy shows a visible error when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    try {
      render(<CreatedUserModal username="newcashier" password="Generated1!" onClose={vi.fn()} />)
      fireEvent.click(screen.getAllByRole('button', { name: /^copy$/i })[1])
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/copy failed/i))
    } finally {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    }
  })
})