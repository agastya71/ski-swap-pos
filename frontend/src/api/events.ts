/**
 * Events API — list, create, and activate swap events.
 * All operations require admin role.
 */
import { apiFetch } from "./client";
import type { Event, EventCreate } from "../types";

/**
 * Fetch all swap events, ordered by year.
 *
 * @returns Array of all Event records (active and inactive).
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getEvents = () => apiFetch<Event[]>("/events");

/**
 * Create a new swap event.
 *
 * @param data - Event name, year, and commission rate.
 * @returns The newly created Event record.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createEvent = (data: EventCreate) =>
 apiFetch<Event>("/events", { method: "POST", body: JSON.stringify(data) });

/**
 * Fetch the currently active swap event, for any authenticated user (cashier,
 * intake, admin). Used to display the event name on checkout transactions and
 * intake requests.
 *
 * @returns The active Event record.
 * @throws {ApiError} 503 if no active event is configured.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getActiveEvent = () => apiFetch<Event>("/events/active");

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
 apiFetch<Event>(`/events/${id}/activate`, { method: "POST" });

/**
 * Permanently delete an inactive event and ALL of its data (sales, items,
 * intakes, sellers, and the event's user accounts). There is no undo.
 *
 * @param id - Primary key of the event to delete. Must not be the active
 *   event, nor the event the logged-in admin belongs to.
 * @returns Summary of what was removed (`deleted` counts per record type).
 * @throws {ApiError} 404 if no event with the given ID exists.
 * @throws {ApiError} 400 if the event is active, or is the caller's own event.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const deleteEvent = (id: number) =>
 apiFetch<{ deleted: number; name: string; db_filename: string }>(
  `/events/${id}`,
  { method: "DELETE" },
 );
