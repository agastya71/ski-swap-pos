/**
 * Item list table for an intake session — displays all consigned items with
 * per-item Edit (expand-below panel), Print Label, and bulk Print All Labels actions.
 * Delete is accessed via the edit panel and is disabled for label-printed items.
 *
 * @module ItemList
 */
import { Fragment, useState } from 'react'
import { deleteItem, printLabel, updateItem } from '../api/items'
import { printIntakeLabels } from '../api/intakes'
import type { Item } from '../types'

const NAVY = '#1e3a8a'

/**
 * Renders a tabular list of items belonging to a single intake session.
 * Provides per-item Edit panel (description, price, brand, size, color), Print Label,
 * and Delete (inside the edit panel, disabled if label printed) actions,
 * plus a bulk Print All Labels button.
 *
 * @param props.items - Array of {@link Item} objects to display.
 * @param props.intakeId - ID of the parent intake session, used for bulk label printing.
 * @param props.onItemsChanged - Callback invoked after any mutation so the parent can re-fetch.
 */
export function ItemList({ items, intakeId, onItemsChanged }: {
  items: Item[]
  intakeId: number
  onItemsChanged: () => void
}) {
  const [expandedEditId, setExpandedEditId] = useState<number | null>(null)
  const [draft, setDraft] = useState({ description: '', price: '', brand: '', size: '', color: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  /** Opens the edit panel for the given item, or closes it if already open. */
  function openEdit(item: Item) {
    if (expandedEditId === item.id) {
      setExpandedEditId(null)
      return
    }
    setExpandedEditId(item.id)
    setDraft({
      description: item.description ?? '',
      price: String(item.price),
      brand: item.brand ?? '',
      size: item.size ?? '',
      color: item.color ?? '',
    })
    setSaveError(null)
  }

  /** Deletes a single item by ID, closes the panel, and notifies the parent. */
  async function handleDelete(id: number) {
    await deleteItem(id)
    setExpandedEditId(null)
    onItemsChanged()
  }

  /** PATCHes the item with the current draft values, closes the panel, and notifies the parent. */
  async function handleSave(itemId: number) {
    setSaving(true)
    setSaveError(null)
    try {
      await updateItem(itemId, {
        description: draft.description,
        price: parseFloat(draft.price),
        brand: draft.brand,
        size: draft.size,
        color: draft.color,
      })
      setExpandedEditId(null)
      onItemsChanged()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  /** Prints the ZPL label for a single item and notifies the parent to refresh. */
  async function handlePrintOne(id: number) {
    await printLabel(id)
    onItemsChanged()
  }

  /** Prints ZPL labels for all items in the current intake and notifies the parent to refresh. */
  async function handlePrintAll() {
    await printIntakeLabels(intakeId)
    onItemsChanged()
  }

  if (items.length === 0) return <p>No items yet. Add items using the form above.</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>{items.length} item{items.length !== 1 ? 's' : ''}</h4>
        <button onClick={handlePrintAll}>Print All Labels</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Code</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Category</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Price</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Label</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <Fragment key={item.id}>
              <tr style={{ borderBottom: expandedEditId === item.id ? 'none' : '1px solid #eee' }}>
                <td style={{ padding: '4px 8px' }}>{item.code}</td>
                <td style={{ padding: '4px 8px' }}>{item.category}</td>
                <td style={{ padding: '4px 8px' }}>{[item.brand, item.description].filter(Boolean).join(' — ') || '—'}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
                <td style={{ padding: '4px 8px' }}>{item.label_printed ? '✓ printed' : '—'}</td>
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => handlePrintOne(item.id)} style={{ marginRight: 4 }}>Print Label</button>
                  <button onClick={() => openEdit(item)}>Edit</button>
                </td>
              </tr>
              {expandedEditId === item.id && (
                <tr>
                  <td colSpan={6} style={{ padding: '8px 16px 16px', background: '#f8fafc', borderBottom: '1px solid #eee' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Description</label>
                        <input
                          value={draft.description}
                          maxLength={99}
                          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Price</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={draft.price}
                          onChange={e => setDraft(d => ({ ...d, price: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Brand</label>
                        <input
                          value={draft.brand}
                          onChange={e => setDraft(d => ({ ...d, brand: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Size</label>
                        <input
                          value={draft.size}
                          onChange={e => setDraft(d => ({ ...d, size: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Color</label>
                        <input
                          value={draft.color}
                          onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                        />
                      </div>
                    </div>
                    {saveError && (
                      <p role="alert" style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px' }}>{saveError}</p>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => handleSave(item.id)}
                        disabled={saving}
                        style={{ background: NAVY, color: '#fff', border: 'none', padding: '4px 12px', cursor: saving ? 'default' : 'pointer', borderRadius: 3, fontSize: 13 }}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setExpandedEditId(null)}
                        style={{ border: '1px solid #94a3b8', color: '#64748b', background: 'none', padding: '4px 12px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={item.label_printed}
                        title={item.label_printed ? 'Cannot delete after labels are printed' : ''}
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', color: item.label_printed ? '#94a3b8' : '#ef4444', cursor: item.label_printed ? 'default' : 'pointer', fontSize: 13 }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
