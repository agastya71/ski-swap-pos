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

describe('SellerListPage — Vendor column', () => {
  /** Overrides GET /sellers with one row whose vendor flag is controlled. */
  function useVendorRow(isVendor: boolean) {
    server.use(
      http.get('/sellers', () =>
        HttpResponse.json([
          {
            id: 1,
            code: 'V001',
            first_name: null,
            last_name: null,
            company: 'Acme Ski Co',
            is_vendor: isVendor,
            phone: null,
            email: null,
            address: null,
            city: null,
            state: null,
            zip: null,
            donate_unsold_default: false,
            donate_proceeds_default: false,
            event_id: 1,
            created_at: '2026-01-01T00:00:00Z',
            item_count: 0,
            labeled_item_count: 0,
          },
        ]),
      ),
    )
  }

  it('renders a Vendor column header', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    expect(screen.getByRole('columnheader', { name: 'Vendor' })).toBeInTheDocument()
  })

  it('shows a check for a commercial vendor', async () => {
    useVendorRow(true)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText(/Acme Ski Co/))
    expect(screen.getByLabelText('vendor seller')).toHaveTextContent('✓')
  })

  it('shows a dash for an individual consignor', async () => {
    useVendorRow(false)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText(/Acme Ski Co/))
    expect(screen.getByLabelText('individual seller')).toHaveTextContent('—')
  })
})

/** Overrides GET /sellers so a test can control the label-progress counts. */
function useSellerRow(itemCount: number, labeledCount: number) {
  server.use(
    http.get('/sellers', () =>
      HttpResponse.json([
        {
          id: 1,
          code: '001',
          first_name: 'Jane',
          last_name: 'Smith',
          company: null,
          is_vendor: false,
          phone: null,
          email: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          donate_unsold_default: false,
          donate_proceeds_default: false,
          event_id: 1,
          created_at: '2026-01-01T00:00:00Z',
          item_count: itemCount,
          labeled_item_count: labeledCount,
        },
      ]),
    ),
  )
}

describe('SellerListPage — Labels column', () => {
  it('renders a Labels column header', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    expect(screen.getByRole('columnheader', { name: 'Labels' })).toBeInTheDocument()
  })

  it('shows a dash for a seller with no items consigned', async () => {
    useSellerRow(0, 0)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    expect(
      screen.getByLabelText(/no items consigned yet/i),
    ).toBeInTheDocument()
  })

  it('flags a seller whose items have not been labeled', async () => {
    useSellerRow(3, 0)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    const cell = screen.getByLabelText(/no labels printed yet, 3 item/i)
    expect(cell).toHaveTextContent('Not yet')
  })

  it('shows partial progress when only some labels are printed', async () => {
    useSellerRow(5, 2)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    const cell = screen.getByLabelText(/partial: 2 of 5 label/i)
    expect(cell).toHaveTextContent('2/5')
  })

  it('shows full completion when every item is labeled', async () => {
    useSellerRow(4, 4)
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    const cell = screen.getByLabelText(/all 4 label/i)
    expect(cell).toHaveTextContent('All 4')
  })

  it('shows a newly registered seller as having no items', async () => {
    render(<SellerListPage onSelectSeller={vi.fn()} eventId={1} />)
    await waitFor(() => screen.getByText('Jane Smith'))
    fireEvent.click(screen.getByRole('button', { name: /register new seller/i }))
    fireEvent.change(await screen.findByLabelText(/first name/i), {
      target: { value: 'Alan' },
    })
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: 'Berg' },
    })
    // The form requires at least one contact channel.
    fireEvent.change(screen.getByLabelText(/phone/i), {
      target: { value: '5551234567' },
    })
    // Address fields are all required by the form.
    fireEvent.change(screen.getByLabelText(/street address/i), {
      target: { value: '1 Main St' },
    })
    fireEvent.change(screen.getByLabelText(/^city$/i), {
      target: { value: 'Traverse City' },
    })
    fireEvent.change(screen.getByLabelText(/^state$/i), {
      target: { value: 'MI' },
    })
    fireEvent.change(screen.getByLabelText(/^zip$/i), {
      target: { value: '49684' },
    })
    fireEvent.click(await screen.findByRole('button', { name: /^register$/i }))
    await waitFor(() => expect(screen.getByText(/Alan/)).toBeInTheDocument())
    expect(screen.getAllByLabelText(/no items consigned yet/i).length).toBe(2)
  })
})
