import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { SellerPayoutPanel } from './SellerPayoutPanel'

describe('SellerPayoutPanel', () => {
  it('shows loading state initially', () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />)
    expect(screen.getByText(/loading payout/i)).toBeInTheDocument()
  })

  it('renders payout summary after data loads', async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />)
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    expect(screen.getByText('Items Sold')).toBeInTheDocument()
    expect(screen.getByText('Gross Sales')).toBeInTheDocument()
    expect(screen.getByText('Seller Payout')).toBeInTheDocument()
    expect(screen.getAllByText('$84.00')[0]).toBeInTheDocument()
  })

  it('renders line items after data loads', async () => {
    render(<SellerPayoutPanel eventId={1} sellerId={1} />)
    await waitFor(() => expect(screen.getByText('Atomic skis')).toBeInTheDocument())
    expect(screen.getByText('Boots')).toBeInTheDocument()
    expect(screen.getByText('001-01')).toBeInTheDocument()
  })

  it('shows error message when API fails', async () => {
    server.use(
      http.get('/reports/:eventId/seller/:sellerId', () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 })
      )
    )
    render(<SellerPayoutPanel eventId={1} sellerId={1} />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
