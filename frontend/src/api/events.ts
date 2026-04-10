/**
 * Events API — list, create, and activate swap events.
 * All operations require admin role.
 */
import { apiFetch } from './client'
import type { Event, EventCreate } from '../types'

/**
 * Fetch all swap events, ordered by year.
 *
 * @returns Array of all Event records (active and inactive).
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getEvents = () => apiFetch<Event[]>('/events')

/**
 * Create a new swap event.
 *
 * @param data - Event name, year, and commission rate.
 * @returns The newly created Event record.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createEvent = (data: EventCreate) =>
  apiFetch<Event>('/events', { method: 'POST', body: JSON.stringify(data) })

/**
 * Activate an event, making it the current active event for all operations.
 * Only one event can be active at a time; activating one deactivates any currently active event.
 *
 * @param id - Primary key of the event to activate.
 * @returns The updated Event record with `is_active: true`.
 * @throws {ApiError} 404 if no event with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const activateEvent = (id: number) =>
  apiFetch<Event>(`/events/${id}/activate`, { method: 'POST' })
