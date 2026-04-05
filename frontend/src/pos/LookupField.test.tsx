import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { LookupField } from './LookupField'
import type { ItemLookupResponse } from '../types'

const FOUND: ItemLookupResponse = {
  id: 1, intake_id: 1, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: null, type: null, description: 'Red skis',
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 75, quantity: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'A001',
}

const FOUND2: ItemLookupResponse = { ...FOUND, id: 2, code: 'A001-002', price: 40 }

function enter(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })
}

describe('LookupField', () => {
  it('renders an input that is focused on mount', () => {
    render(<LookupField onFound={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  it('calls onFound with the item when exact lookup succeeds', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(FOUND)))
    const onFound = vi.fn()
    render(<LookupField onFound={onFound} />)
    enter('A001-001')
    await waitFor(() => expect(onFound).toHaveBeenCalledWith(FOUND))
  })

  it('clears the input after a successful exact lookup', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(FOUND)))
    render(<LookupField onFound={vi.fn()} />)
    enter('A001-001')
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(''))
  })

  it('shows error when item is not found and partial search also empty', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json({ detail: 'Item not found' }, { status: 404 })),
      http.get('/items/search', () => HttpResponse.json([])),
    )
    render(<LookupField onFound={vi.fn()} />)
    enter('ZZZZ')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/item not found/i))
  })

  it('shows error when item is already sold', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json({ ...FOUND, status: 'sold' })))
    render(<LookupField onFound={vi.fn()} />)
    enter('A001-001')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already sold/i))
  })

  it('error clears when user starts typing again', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json({ detail: 'Item not found' }, { status: 404 })),
      http.get('/items/search', () => HttpResponse.json([])),
    )
    render(<LookupField onFound={vi.fn()} />)
    enter('ZZZZ')
    await waitFor(() => screen.getByRole('alert'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows results list when partial search returns multiple items', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json({ detail: 'Not found' }, { status: 404 })),
      http.get('/items/search', () => HttpResponse.json([FOUND, FOUND2])),
    )
    render(<LookupField onFound={vi.fn()} />)
    enter('A001')
    await waitFor(() => expect(screen.getByText('A001-001')).toBeInTheDocument())
    expect(screen.getByText('A001-002')).toBeInTheDocument()
    expect(screen.getByText(/2 items found/i)).toBeInTheDocument()
  })

  it('auto-adds item when partial search returns exactly one available match', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json({ detail: 'Not found' }, { status: 404 })),
      http.get('/items/search', () => HttpResponse.json([FOUND])),
    )
    const onFound = vi.fn()
    render(<LookupField onFound={onFound} />)
    enter('A001-001')
    await waitFor(() => expect(onFound).toHaveBeenCalledWith(FOUND))
  })

  it('calls onFound when user clicks an item in the results list', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json({ detail: 'Not found' }, { status: 404 })),
      http.get('/items/search', () => HttpResponse.json([FOUND, FOUND2])),
    )
    const onFound = vi.fn()
    render(<LookupField onFound={onFound} />)
    enter('A001')
    await waitFor(() => screen.getByText('A001-001'))
    fireEvent.click(screen.getByText('A001-001').closest('button')!)
    expect(onFound).toHaveBeenCalledWith(FOUND)
  })

  it('closes results list when Escape is pressed', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json({ detail: 'Not found' }, { status: 404 })),
      http.get('/items/search', () => HttpResponse.json([FOUND, FOUND2])),
    )
    render(<LookupField onFound={vi.fn()} />)
    enter('A001')
    await waitFor(() => screen.getByText('A001-001'))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(screen.queryByText('A001-001')).not.toBeInTheDocument()
  })
})
