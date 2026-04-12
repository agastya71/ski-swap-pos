/**
 * Tests for SellerDetailPage — contact card, items table, and action buttons.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { ADMIN_TOKEN } from '../mocks/tokens'
import { setToken } from '../api/client'
import { SellerDetailPage } from './SellerDetailPage'

const seller = {
  id: 1, code: '001', first_name: 'Jane', last_name: 'Smith',
  company: null, is_vendor: false, phone: '612-555-0101', email: 'jane@example.com',
  address: '123 Main St', city: 'Minneapolis', state: 'MN', zip: '55401',
  event_id: 1, created_at: '2026-01-01T00:00:00Z',
}

describe('SellerDetailPage', () => {
  it('renders seller contact info', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('612-555-0101')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
  })

  it('renders items table with item from API', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    await waitFor(() => expect(screen.getByText('001-01')).toBeInTheDocument())
    expect(screen.getByText('Atomic skis 160cm')).toBeInTheDocument()
  })

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn()
    render(<SellerDetailPage seller={seller} onBack={onBack} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows Add Item button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument()
  })

  it('shows Import from Excel button', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /import from excel/i })).toBeInTheDocument()
  })

  it('shows Payout button in action bar', () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    expect(screen.getByRole('button', { name: /payout/i })).toBeInTheDocument()
  })

  it('shows payout panel when Payout button is clicked', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getByText('$84.00')).toBeInTheDocument())
  })

  it('hides payout panel when Payout button is clicked a second time', async () => {
    render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.getByText('$84.00')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /payout/i }))
    await waitFor(() => expect(screen.queryByText('$84.00')).not.toBeInTheDocument())
  })
})

describe('SellerDetailPage — Import from Excel button (functional)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setToken(null)
  })

  it('sends an authenticated POST to /intakes/:id/items/import', async () => {
    setToken(ADMIN_TOKEN)
    let capturedRequest: Request | null = null
    server.use(
      http.post('/intakes/:intakeId/items/import', ({ request }) => {
        capturedRequest = request
        return HttpResponse.json({ imported: 1, skipped: 0, errors: [] })
      }),
    )

    const { container } = render(<SellerDetailPage seller={seller} onBack={vi.fn()} eventId={1} />)

    const mockFile = new File([''], 'items.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [mockFile] } })

    await waitFor(() => expect(capturedRequest).not.toBeNull())
    expect(capturedRequest!.url).toMatch(/\/intakes\/\d+\/items\/import$/)
    expect(capturedRequest!.url).not.toContain('/api/')
    expect(capturedRequest!.headers.get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`)
  })
})
