/**
 * Tests for {@link LookupField} — covers exact barcode lookup, partial-code search
 * fallback (single auto-add, multi-item picker), error states (not found, already sold),
 * error dismissal on retype, Escape dismissal, click-to-select from results list,
 * live autocomplete debounce timing, and ArrowUp/Down keyboard navigation.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { LookupField } from './LookupField'
import type { ItemLookupResponse } from '../types'

const FOUND: ItemLookupResponse = {
  id: 1, intake_id: 1, seller_id: 1, code: 'A001-001',
  category: 'Skis', brand: null, type: null, description: 'Red skis',
  color: null, size: null, uom: null, gender_age: null, year: null,
  used: true, price: 75, quantity: 2,
  remaining: 1,
  barcode_39: null, label_line_2: null, label_line_3: null,
  donate_unsold: false, status: 'available', label_printed: false, is_deleted: false,
  vendor_item_id: null, created_at: '2026-04-04T10:00:00',
  seller_code: 'A001',
}

const FOUND2: ItemLookupResponse = { ...FOUND, id: 2, code: 'A001-002', price: 40 }

function enter(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })
}

/** Tests for the main LookupField component — exact lookup, partial search, and UX behaviours. */
describe('LookupField', () => {
  /** Verifies the input receives focus automatically when the component mounts. */
  it('renders an input that is focused on mount', () => {
    render(<LookupField onFound={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  /** Verifies onFound is called with the matching item when the exact lookup API returns a result. */
  it('calls onFound with the item when exact lookup succeeds', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(FOUND)))
    const onFound = vi.fn()
    render(<LookupField onFound={onFound} />)
    enter('A001-001')
    await waitFor(() => expect(onFound).toHaveBeenCalledWith(FOUND))
  })

  /** Verifies the input field is cleared after a successful exact-match lookup. */
  it('clears the input after a successful exact lookup', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json(FOUND)))
    render(<LookupField onFound={vi.fn()} />)
    enter('A001-001')
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(''))
  })

  /** Verifies an alert is shown when neither exact lookup nor partial search finds any item. */
  it('shows error when item is not found and partial search also empty', async () => {
    server.use(
      http.get('/items/lookup', () => HttpResponse.json({ detail: 'Item not found' }, { status: 404 })),
      http.get('/items/search', () => HttpResponse.json([])),
    )
    render(<LookupField onFound={vi.fn()} />)
    enter('ZZZZ')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/item not found/i))
  })

  /** Verifies an alert is shown when the looked-up item has a non-available status (e.g. 'sold'). */
  it('shows sold-out error when item has no remaining units', async () => {
    server.use(http.get('/items/lookup', () => HttpResponse.json({ ...FOUND, remaining: 0 })))
    render(<LookupField onFound={vi.fn()} />)
    enter('A001-001')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/sold out/i))
  })

  /** Verifies the error alert disappears as soon as the user begins typing a new code. */
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

  /** Verifies the autocomplete dropdown displays all matches when a partial search returns multiple items. */
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

  /** Verifies onFound is called immediately when partial search returns exactly one available item. */
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

  /** Verifies clicking an item row in the dropdown calls onFound with that item. */
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

  /** Verifies pressing Escape dismisses the dropdown without selecting any item. */
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

  /** Tests for the 300 ms debounced autocomplete search behaviour. */
  describe('live autocomplete', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers() })

    /** Verifies the dropdown appears after the 300 ms debounce fires when at least 3 characters are typed. */
    it('shows dropdown after typing 3 chars and waiting 300ms', async () => {
      server.use(http.get('/items/search', () => HttpResponse.json([FOUND, FOUND2])))
      render(<LookupField onFound={vi.fn()} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A00' } })
      expect(screen.queryByText('A001-001')).not.toBeInTheDocument()
      await act(async () => { vi.advanceTimersByTime(300) })
      expect(screen.getByText('A001-001')).toBeInTheDocument()
    })

    /** Verifies no search is triggered and no dropdown appears when fewer than 3 characters are typed. */
    it('does not show dropdown after typing only 2 chars', () => {
      server.use(http.get('/items/search', () => HttpResponse.json([FOUND])))
      render(<LookupField onFound={vi.fn()} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A0' } })
      act(() => { vi.advanceTimersByTime(300) })
      expect(screen.queryByText('A001-001')).not.toBeInTheDocument()
    })

    /** Verifies the search API is not called before the 300 ms debounce window elapses. */
    it('does not fire search before 300ms', () => {
      const handler = vi.fn(() => HttpResponse.json([FOUND]))
      server.use(http.get('/items/search', handler))
      render(<LookupField onFound={vi.fn()} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A00' } })
      act(() => { vi.advanceTimersByTime(200) })
      expect(handler).not.toHaveBeenCalled()
    })

    /** Verifies the dropdown is dismissed immediately when the input is trimmed back below 3 characters. */
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

  /** Tests for ArrowUp/Down keyboard navigation within the autocomplete dropdown. */
  describe('arrow key navigation', () => {
    const SOLD = { ...FOUND, id: 3, code: 'A001-003', status: 'sold' as const, remaining: 0 }

    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers() })

    async function openDropdown(results = [FOUND, FOUND2], onFound = vi.fn()) {
      server.use(http.get('/items/search', () => HttpResponse.json(results)))
      render(<LookupField onFound={onFound} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A00' } })
      await act(async () => { vi.advanceTimersByTime(300) })
    }

    /** Verifies ArrowDown applies a highlight background to the first available item in the dropdown. */
    it('ArrowDown highlights the first available item', async () => {
      await openDropdown()
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
      const btn = screen.getByText('A001-001').closest('button')!
      expect(btn).toHaveStyle({ background: 'rgb(232, 238, 249)' })
    })

    /** Verifies ArrowDown skips over sold/unavailable items and highlights the next available one. */
    it('ArrowDown skips non-available items', async () => {
      await openDropdown([SOLD, FOUND])
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
      const btn = screen.getByText('A001-001').closest('button')!
      expect(btn).toHaveStyle({ background: 'rgb(232, 238, 249)' })
    })

    /** Verifies pressing Enter when an item is highlighted calls onFound with that item. */
    it('Enter selects the highlighted item', async () => {
      const onFound = vi.fn()
      await openDropdown([FOUND, FOUND2], onFound)
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
      expect(onFound).toHaveBeenCalledWith(FOUND)
    })

    /** Verifies that clicking a sold/unavailable row in the dropdown does not invoke onFound. */
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

    /** Verifies pressing Escape while a dropdown item is highlighted dismisses the dropdown. */
    it('Escape closes dropdown and clears highlight', async () => {
      await openDropdown()
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
      expect(screen.queryByText('A001-001')).not.toBeInTheDocument()
    })
  })
})
