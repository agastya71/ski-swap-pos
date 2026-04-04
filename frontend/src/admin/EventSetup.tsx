import { useState, useEffect, type FormEvent } from 'react'
import { getEvents, createEvent, activateEvent } from '../api/events'
import type { Event } from '../types'

export function EventSetup() {
  const [events, setEvents] = useState<Event[]>([])
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [commission, setCommission] = useState('0.30')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    const data = await getEvents()
    setEvents(data)
  }

  useEffect(() => { load().catch(() => {}) }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const created = await createEvent({ name, year: parseInt(year), commission_rate: parseFloat(commission) })
      setEvents(prev => [...prev, created])
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setLoading(false)
    }
  }

  async function handleActivate(id: number) {
    await activateEvent(id)
    await load()
  }

  return (
    <div>
      <h3>Events</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Year</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Commission</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {events.map(ev => (
            <tr key={ev.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 8px' }}>{ev.name}</td>
              <td style={{ padding: '6px 8px' }}>{ev.year}</td>
              <td style={{ padding: '6px 8px' }}>{(ev.commission_rate * 100).toFixed(0)}%</td>
              <td style={{ padding: '6px 8px' }}>{ev.is_active ? <strong>Active</strong> : '—'}</td>
              <td style={{ padding: '6px 8px' }}>
                {!ev.is_active && (
                  <button onClick={() => handleActivate(ev.id)}>Activate</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Create New Event</h4>
      <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <div>
          <label htmlFor="eventName" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Event Name</label>
          <input id="eventName" value={name} onChange={e => setName(e.target.value)} required style={{ width: '100%', padding: 6, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="eventYear" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Year</label>
          <input id="eventYear" type="number" value={year} onChange={e => setYear(e.target.value)} required style={{ width: '100%', padding: 6, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label htmlFor="eventCommission" style={{ display: 'block', fontSize: 13, marginBottom: 3 }}>Commission (0.00–1.00)</label>
          <input id="eventCommission" type="number" step="0.01" min="0" max="1" value={commission} onChange={e => setCommission(e.target.value)} required style={{ width: '100%', padding: 6, boxSizing: 'border-box' }} />
        </div>
        <button type="submit" disabled={loading}>Create Event</button>
      </form>
      {error && <div role="alert" style={{ color: 'red', marginTop: 8 }}>{error}</div>}
    </div>
  )
}
