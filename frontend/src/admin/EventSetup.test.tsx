/**
 * Tests for {@link EventSetup} — covers initial event list rendering (including
 * active status indicator display), successful event creation flow, event activation via
 * the Activate button, and error display when the create API call fails.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'
import { EventSetup } from './EventSetup'
import type { Event } from '../types'

const EVENTS: Event[] = [
  { id: 1, name: 'Swap 2025', year: 2025, commission_rate: 0.3, is_active: false },
  { id: 2, name: 'Swap 2026', year: 2026, commission_rate: 0.3, is_active: true },
]
const NEW_EVENT: Event = { id: 3, name: 'Swap 2027', year: 2027, commission_rate: 0.3, is_active: false }

/** EventSetup admin panel — event list display, creation, activation, and error handling. */
describe('EventSetup', () => {
  /** Verifies that all events are listed and the active event shows an active status indicator. */
  it('lists existing events with active badge', async () => {
    server.use(http.get('/events', () => HttpResponse.json(EVENTS)))
    render(<EventSetup />)
    await waitFor(() => expect(screen.getByText('Swap 2026')).toBeInTheDocument())
    expect(screen.getByText('Swap 2025')).toBeInTheDocument()
    expect(screen.getByText(/active/i)).toBeInTheDocument()
  })

  /** Verifies that submitting the create form adds the new event to the displayed list. */
  it('creates a new event and shows it in the list', async () => {
    server.use(
      http.get('/events', () => HttpResponse.json(EVENTS)),
      http.post('/events', () => HttpResponse.json(NEW_EVENT)),
    )
    render(<EventSetup />)
    await waitFor(() => screen.getByText('Swap 2026'))
    fireEvent.change(screen.getByLabelText(/event name/i), { target: { value: 'Swap 2027' } })
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: '2027' } })
    fireEvent.change(screen.getByLabelText(/commission/i), { target: { value: '0.3' } })
    fireEvent.click(screen.getByRole('button', { name: /create event/i }))
    await waitFor(() => expect(screen.getByText('Swap 2027')).toBeInTheDocument())
  })

  /** Verifies that clicking the Activate button calls the activate API endpoint. */
  it('activates an event when Activate is clicked', async () => {
    let activated = false
    server.use(
      http.get('/events', () => HttpResponse.json(EVENTS)),
      http.post('/events/:id/activate', () => {
        activated = true
        return HttpResponse.json({ ...EVENTS[0], is_active: true })
      }),
    )
    render(<EventSetup />)
    await waitFor(() => screen.getByText('Swap 2025'))
    const activateButtons = screen.getAllByRole('button', { name: /activate/i })
    fireEvent.click(activateButtons[0])
    await waitFor(() => expect(activated).toBe(true))
  })

  /** Verifies that a server error response is surfaced as an inline alert message. */
  it('shows error when create fails', async () => {
    server.use(
      http.get('/events', () => HttpResponse.json(EVENTS)),
      http.post('/events', () => HttpResponse.json({ detail: 'Event already exists' }, { status: 400 })),
    )
    render(<EventSetup />)
    await waitFor(() => screen.getByText('Swap 2026'))
    fireEvent.change(screen.getByLabelText(/event name/i), { target: { value: 'Swap 2026' } })
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: '2026' } })
    fireEvent.change(screen.getByLabelText(/commission/i), { target: { value: '0.3' } })
    fireEvent.click(screen.getByRole('button', { name: /create event/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/event already exists/i))
  })
})
