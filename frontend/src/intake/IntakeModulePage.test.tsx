import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { AuthProvider } from '../auth/AuthContext'
import { IntakeModulePage } from './IntakeModulePage'
import type { Seller } from '../types'
import { vi, afterEach } from 'vitest'
import { ADMIN_TOKEN } from '../mocks/tokens'
import { setToken } from '../api/client'

const SELLER: Seller = {
  id: 1, code: '001', first_name: 'Jane', last_name: 'Doe',
  company: null, is_vendor: false, phone: '555-1234', email: 'jane@example.com',
  address: null, city: null, state: null, zip: null,
  event_id: 1, created_at: '2026-04-04T10:00:00',
}

function renderPage() {
  render(<AuthProvider><IntakeModulePage /></AuthProvider>)
}

describe('IntakeModulePage', () => {
  /** Verifies that both tab buttons are rendered. */
  it('renders Intake and Sellers tab buttons', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /^intake$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sellers$/i })).toBeInTheDocument()
  })

  /** Verifies that the intake workflow (seller search input) is shown by default. */
  it('shows intake workflow by default', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or code/i)).toBeInTheDocument()
  })

  /** Verifies that the Intake tab button carries aria-current="page" by default. */
  it('marks Intake tab as active by default', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /^intake$/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /^sellers$/i })).not.toHaveAttribute('aria-current')
  })

  /** Verifies that clicking the Sellers tab shows the seller list. */
  it('shows seller list when Sellers tab is clicked', async () => {
    server.use(http.get('/sellers', () => HttpResponse.json([SELLER])))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^sellers$/i }))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^sellers$/i })).toHaveAttribute('aria-current', 'page')
  })

  /** Verifies that clicking View on a seller row shows SellerDetailPage. */
  it('shows seller detail when View is clicked', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.get('/sellers/:id/items', () => HttpResponse.json([])),
      http.get('/sellers/:id/intakes', () => HttpResponse.json([])),
    )
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^sellers$/i }))
    await waitFor(() => screen.getByText('Jane Doe'))
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument())
  })

  /** Verifies that clicking Back from detail returns to the seller list. */
  it('returns to seller list when Back is clicked', async () => {
    server.use(
      http.get('/sellers', () => HttpResponse.json([SELLER])),
      http.get('/sellers/:id/items', () => HttpResponse.json([])),
      http.get('/sellers/:id/intakes', () => HttpResponse.json([])),
    )
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^sellers$/i }))
    await waitFor(() => screen.getByText('Jane Doe'))
    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    await waitFor(() => screen.getByRole('button', { name: /back/i }))
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument())
  })
})

describe('IntakeModulePage — Download Template button (functional)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setToken(null)
  })

  it('is always visible in the tab bar', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument()
  })

  it('sends an authenticated GET to /items/import-template', async () => {
    setToken(ADMIN_TOKEN)
    let capturedRequest: Request | null = null
    server.use(
      http.get('/items/import-template', ({ request }) => {
        capturedRequest = request
        return new HttpResponse(new ArrayBuffer(8), {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        })
      }),
    )

    renderPage()

    // Suppress blob URL side-effects after mount
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: /download template/i }))

    await waitFor(() => expect(capturedRequest).not.toBeNull())
    expect(capturedRequest!.url).toContain('/items/import-template')
    expect(capturedRequest!.url).not.toContain('/api/')
    expect(capturedRequest!.headers.get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`)
  })
})
