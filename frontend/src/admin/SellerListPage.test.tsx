import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SellerListPage } from './SellerListPage'

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
})
