/**
 * Event setup admin panel — lists all swap events, allows admins to create new events
 * and activate an existing one as the current active event.
 */

import { useState, useEffect, type FormEvent } from "react";
import { useUiVariant } from "../lib/uiVariant";
import { EVENT_SETUP, v2Only, variantProps } from "./adminStyles";
import {
  getEvents,
  createEvent,
  activateEvent,
  deleteEvent,
} from "../api/events";
import type { Event } from "../types";

/**
 * Admin panel for managing swap events: displays the event list with activation
 * controls and provides a form to create a new event.
 */
export function EventSetup() {
  const [events, setEvents] = useState<Event[]>([]);
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [commission, setCommission] = useState("0.30");
  const [vendorCommission, setVendorCommission] = useState("0.30");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const v2 = useUiVariant() === "v2";

  /** Fetches the full event list from the API and updates local state. */
  async function load() {
    const data = await getEvents();
    setEvents(data);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  /** Submits the create-event form, appends the new event to the list on success. */
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const created = await createEvent({
        name,
        year: parseInt(year),
        commission_rate: parseFloat(commission),
        vendor_commission_rate: parseFloat(vendorCommission),
      });
      setEvents((prev) => [...prev, created]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setLoading(false);
    }
  }

  /** Activates the event with the given ID and refreshes the list to reflect the new status. */
  async function handleActivate(id: number) {
    await activateEvent(id);
    await load();
  }

  /** Deletes an inactive event (with confirmation) and refreshes the list. */
  async function handleDelete(ev: Event) {
    const ok = window.confirm(
      `Delete event "${ev.name}" (${ev.year})? This PERMANENTLY removes its ` +
        "entire database file (all sales, items, intakes, and sellers). There is no undo.",
    );
    if (!ok) return;
    setError(null);
    try {
      const result = await deleteEvent(ev.id);
      window.alert(
        `Deleted "${result.name}" and its database file (${result.db_filename}).`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete event");
    }
  }

  return (
    <div {...v2Only(v2, "ui2-scroll-x")}>
      <h3>Events</h3>
      <table
        {...variantProps(
          v2,
          "ui2-settings-table ui2-settings-table--wide",
          EVENT_SETUP.table,
        )}
      >
        <thead>
          <tr>
            <th>Name</th>
            <th>Year</th>
            <th>Commission</th>
            <th>Vendor Rate</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <tr key={ev.id}>
              <td>{ev.name}</td>
              <td>{ev.year}</td>
              <td>{(ev.commission_rate * 100).toFixed(0)}%</td>
              <td>{(ev.vendor_commission_rate * 100).toFixed(0)}%</td>
              <td>{ev.is_active ? <strong>Active</strong> : "—"}</td>
              <td {...v2Only(v2, "ui2-settings-actions")}>
                {!ev.is_active && (
                  <>
                    <button onClick={() => handleActivate(ev.id)}>Activate</button>
                    <button onClick={() => void handleDelete(ev)}>Delete</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Create New Event</h4>
      <form
        onSubmit={handleCreate}
        {...variantProps(v2, "ui2-settings-form ui2-settings-form--events", EVENT_SETUP.form)}
      >
        <div>
          <label htmlFor="eventName">Event Name</label>
          <input
            id="eventName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="eventYear">Year</label>
          <input
            id="eventYear"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="eventCommission">Commission (0.00–1.00)</label>
          <input
            id="eventCommission"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="eventVendorCommission">Vendor Rate (0.00–1.00)</label>
          <input
            id="eventVendorCommission"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={vendorCommission}
            onChange={(e) => setVendorCommission(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          Create Event
        </button>
      </form>
      {error && (
        <div role="alert" {...variantProps(v2, "ui2-settings-error", EVENT_SETUP.error)}>
          {error}
        </div>
      )}
    </div>
  );
}
