/**
 * Tests for {@link SellerSearch} — covers initial render, live search results display,
 * onSelect callback when a result is clicked, empty-results message, and the
 * Register New Seller fallback button.
 *
 * @module SellerSearch.test
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { SellerSearch } from './SellerSearch'
import type { Seller } from '../types'

const SELLER: Seller = {
  id: 1, code: 'A001', first_name: 'Jane', last_name: 'Doe',
  company: null, is_vendor: false, phone: '555-1234', email: null,
  address: null, city: null, state: null, zip: null,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}

/** Tests covering the SellerSearch component's rendering and search behaviour. */
describe('SellerSearch', () => {
  /** Verifies that the search input and Register New Seller button are present on initial render. */
  it('renders search input and empty state', () => {
    render(<SellerSearch onSelect={vi.fn()} onCreateNew={vi.fn()} />)
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register new seller/i })).toBeInTheDocument()
  })

  /** Verifies that typing a query fetches sellers and displays the matching result. */
  it('shows results matching query', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER]))
    )
    render(<SellerSearch onSelect={vi.fn()} onCreateNew={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/search by name or code/i), { target: { value: 'Jane' } })
    await waitFor(() => expect(screen.getByText('Jane Doe — A001')).toBeInTheDocument())
  })

  /** Verifies that clicking a search result invokes onSelect with the corresponding seller object. */
  it('calls onSelect when a result is clicked', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER]))
    )
    const onSelect = vi.fn()
    render(<SellerSearch onSelect={onSelect} onCreateNew={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/search by name or code/i), { target: { value: 'Jane' } })
    await waitFor(() => screen.getByText('Jane Doe — A001'))
    fireEvent.click(screen.getByText('Jane Doe — A001'))
    expect(onSelect).toHaveBeenCalledWith(SELLER)
  })

  /** Verifies that an empty API response causes a "No sellers found" message to appear. */
  it('shows no results message when API returns empty', async () => {
    server.use(http.get('/sellers', () => HttpResponse.json([])))
    render(<SellerSearch onSelect={vi.fn()} onCreateNew={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/search by name or code/i), { target: { value: 'xyz' } })
    await waitFor(() => expect(screen.getByText(/no sellers found/i)).toBeInTheDocument())
  })

  /** Verifies that clicking "Register New Seller" calls the onCreateNew callback exactly once. */
  it('calls onCreateNew when Register New Seller is clicked', () => {
    const onCreateNew = vi.fn()
    render(<SellerSearch onSelect={vi.fn()} onCreateNew={onCreateNew} />)
    fireEvent.click(screen.getByRole('button', { name: /register new seller/i }))
    expect(onCreateNew).toHaveBeenCalledTimes(1)
  })
})
