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

describe('LookupField', () => {
  it('renders an input that is focused on mount', () => {
    render(<LookupField onFound={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  it('calls onFound with the item when lookup succeeds', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(FOUND)))
    const onFound = vi.fn()
    render(<LookupField onFound={onFound} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(onFound).toHaveBeenCalledWith(FOUND))
  })

  it('clears the input after a successful lookup', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(FOUND)))
    render(<LookupField onFound={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(''))
  })

  it('shows error when item is not found (404)', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json({ detail: 'Item not found' }, { status: 404 })))
    render(<LookupField onFound={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ZZZZ' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/item not found/i))
  })

  it('shows error when item is already sold', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json({ ...FOUND, status: 'sold' })))
    render(<LookupField onFound={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A001-001' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already sold/i))
  })

  it('error clears when user starts typing again', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json({ detail: 'Item not found' }, { status: 404 })))
    render(<LookupField onFound={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ZZZZ' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })
    await waitFor(() => screen.getByRole('alert'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
