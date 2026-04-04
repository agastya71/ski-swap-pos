import { apiFetch } from './client'
import type { Event, EventCreate } from '../types'

export const getEvents = () => apiFetch<Event[]>('/events')
export const createEvent = (data: EventCreate) =>
  apiFetch<Event>('/events', { method: 'POST', body: JSON.stringify(data) })
export const activateEvent = (id: number) =>
  apiFetch<Event>(`/events/${id}/activate`, { method: 'POST' })
