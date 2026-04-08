import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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

  describe('live autocomplete', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers() })

    it('shows dropdown after typing 3 chars and waiting 300ms', async () => {
      server.use(http.get('/items/search', () => HttpResponse.json([FOUND, FOUND2])))
      render(<LookupField onFound={vi.fn()} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A00' } })
      expect(screen.queryByText('A001-001')).not.toBeInTheDocument()
      await act(async () => { vi.advanceTimersByTime(300) })
      expect(screen.getByText('A001-001')).toBeInTheDocument()
    })

    it('does not show dropdown after typing only 2 chars', () => {
      server.use(http.get('/items/search', () => HttpResponse.json([FOUND])))
      render(<LookupField onFound={vi.fn()} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A0' } })
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.queryByText('A001-001')).not.toBeInTheDocument()
    })

    it('does not fire search before 300ms', () => {
      const handler = vi.fn(() => HttpResponse.json([FOUND]))
      server.use(http.get('/items/search', handler))
      render(<LookupField onFound={vi.fn()} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A00' } })
      act(() => { vi.advanceTimersByTime(200) })
      expect(handler).not.toHaveBeenCalled()
    })

    it('closes dropdown when input drops below 3 chars', async () => {
      server.use(http.get('/items/search', () => HttpResponse.json([FOUND, FOUND2])))
      render(<LookupField onFound={vi.fn()} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A00' } })
      await act(async () => { vi.advanceTimersByTime(300) })
      expect(screen.getByText('A001-001')).toBeInTheDocument()
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A0' } })
      expect(screen.queryByText('A001-001')).not.toBeInTheDocument()
    })
  })

  describe('arrow key navigation', () => {
    const SOLD = { ...FOUND, id: 3, code: 'A001-003', status: 'sold' }

    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers() })

    async function openDropdown(results = [FOUND, FOUND2], onFound = vi.fn()) {
      server.use(http.get('/items/search', () => HttpResponse.json(results)))
      render(<LookupField onFound={onFound} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A00' } })
      await act(async () => { vi.advanceTimersByTime(300) })
    }

    it('ArrowDown highlights the first available item', async () => {
      await openDropdown()
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
      const btn = screen.getByText('A001-001').closest('button')!
      expect(btn).toHaveStyle({ background: 'rgb(232, 238, 249)' })
    })

    it('ArrowDown skips non-available items', async () => {
      await openDropdown([SOLD, FOUND])
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
      const btn = screen.getByText('A001-001').closest('button')!
      expect(btn).toHaveStyle({ background: 'rgb(232, 238, 249)' })
    })

    it('Enter selects the highlighted item', async () => {
      const onFound = vi.fn()
      await openDropdown([FOUND, FOUND2], onFound)
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      expect(onFound).toHaveBeenCalledWith(FOUND)
    })

    it('non-available item row is not clickable', async () => {
      const onFound = vi.fn()
      server.use(http.get('/items/search', () => HttpResponse.json([SOLD])))
      render(<LookupField onFound={onFound} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A00' } })
      await act(async () => { vi.advanceTimersByTime(300) })
      screen.getByText('A001-003')
      fireEvent.click(screen.getByText('A001-003').closest('button')!)
      expect(onFound).not.toHaveBeenCalled()
    })

    it('Escape closes dropdown and clears highlight', async () => {
      await openDropdown()
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
      expect(screen.queryByText('A001-001')).not.toBeInTheDocument()
    })
  })
})
