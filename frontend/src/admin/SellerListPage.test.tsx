import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SellerListPage } from './SellerListPage'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SellerListPage', () => {
  it('renders seller list', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByText('Jane Smith')).toBeInTheDocument())
    expect(screen.getByText('001')).toBeInTheDocument()
  })

  it('renders search input with helpful label', () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })

  it('calls onSelectSeller when View is clicked', async () => {
    const onSelectSeller = vi.fn()
    render(<SellerListPage onSelectSeller={onSelectSeller} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(onSelectSeller).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('renders Register New Seller button', () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /register new seller/i })).toBeInTheDocument()
  })

  it('shows Payout button for each seller row', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    expect(screen.getByRole('button', { name: /payout/i })).toBeInTheDocument()
  })

  it('shows payout panel when Payout is clicked', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getAllByText('$84.00')[0]).toBeInTheDocument())
  })

  it('hides payout panel when Payout is clicked a second time', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getAllByText('$84.00')[0]).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.queryByText('$84.00')).not.toBeInTheDocument())
  })

  /** Delete (admin, erroneous records): confirm-gated; on confirm the API is
   *  called and the row disappears from the list. */
  it('deletes an erroneous seller after confirmation', async () => {
    let deletedId = ''
    server.use(
      http.delete('/sellers/:id', ({ params }) => {
        deletedId = String(params.id)
        return HttpResponse.json({
          deleted: Number(params.id),
          code: '001',
          name: 'Jane Smith',
        })
      }),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /delete seller 001/i }))
    await waitFor(() =>
      expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument(),
    )
    expect(deletedId).toBe('1')
  })

  it('keeps the seller row when the confirm dialog is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /delete seller 001/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /delete seller 001/i })).toBeInTheDocument(),
    )
  })

  it('surfaces the backend 409 when the seller still has items', async () => {
    server.use(
      http.delete('/sellers/:id', () =>
        HttpResponse.json(
          {
            detail:
              'Cannot delete seller 001 — it still has 1 item(s), including soft-deleted ones. Delete or reassign those items first.',
          },
          { status: 409 },
        ),
      ),
    )
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /delete seller 001/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/still has 1 item/i),
    )
    // The 409 row stays listed.
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
  })
})
