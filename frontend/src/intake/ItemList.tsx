/**
 * Item list table for an intake session — displays all consigned items with
 * per-item Edit (expand-below panel), Print Label, and bulk Print All Labels actions.
 * Delete is accessed via the edit panel and is disabled for label-printed items.
 *
 * @module ItemList
 */
import { Fragment, useState } from 'react'
import { adjustItemQuantity, deleteItem, printLabel, updateItem } from '../api/items'
import { printIntakeLabels } from '../api/intakes'
import { ITEM_TYPES, SIZE_OPTIONS } from '../lib/itemSizes'
import type { Item, ItemUpdate } from '../types'

const GENDER_AGE_OPTIONS = ['Adult', 'Youth', 'Toddler', 'Unisex']

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
  const [draft, setDraft] = useState({ description: '', price: '', brand: '', type: '', size: '', gender_age: '', color: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [qtyAdjust, setQtyAdjust] = useState('')
  const [qtyError, setQtyError] = useState<string | null>(null)

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
      type: item.type ?? '',
      size: item.size ?? '',
      gender_age: item.gender_age ?? '',
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

  /** Adjusts the item's on-hand quantity by a signed delta and refreshes. */
  async function handleAdjustQty(itemId: number) {
    const delta = parseInt(qtyAdjust, 10)
    if (Number.isNaN(delta) || delta === 0) return
    setQtyError(null)
    try {
      await adjustItemQuantity(itemId, delta)
      setQtyAdjust('')
      onItemsChanged()
    } catch (err) {
      setQtyError(err instanceof Error ? err.message : 'Failed to adjust quantity')
    }
  }

  /** PATCHes the item with only the fields that changed, closes the panel, and notifies the parent. */
  async function handleSave(itemId: number) {
    setSaving(true)
    setSaveError(null)
    try {
      const original = items.find(i => i.id === itemId)!
      const update: Record<string, string | number> = {}
      if (draft.description !== (original.description ?? '')) update.description = draft.description
      if (parseFloat(draft.price) !== original.price) update.price = parseFloat(draft.price)
      if (draft.brand !== (original.brand ?? '')) update.brand = draft.brand
      if (draft.type !== (original.type ?? '')) update.type = draft.type
      if (draft.size !== (original.size ?? '')) update.size = draft.size
      if (draft.gender_age !== (original.gender_age ?? '')) update.gender_age = draft.gender_age
      if (draft.color !== (original.color ?? '')) update.color = draft.color
      await updateItem(itemId, update as ItemUpdate)
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
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Qty</th>
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
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{item.quantity}</td>
                <td style={{ padding: '4px 8px' }}>{item.label_printed ? '✓ printed' : '—'}</td>
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => handlePrintOne(item.id)} style={{ marginRight: 4 }}>Print Label</button>
                  <button onClick={() => openEdit(item)}>Edit</button>
                </td>
              </tr>
              {expandedEditId === item.id && (
                <tr>
                  <td colSpan={7} style={{ padding: '8px 16px 16px', background: '#f8fafc', borderBottom: '1px solid #eee' }}>
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
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Type</label>
                        <select
                          value={draft.type}
                          onChange={e => setDraft(d => ({ ...d, type: e.target.value, size: d.type ? '' : d.size }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                        >
                          <option value="">— select type —</option>
                          {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Size</label>
                        {SIZE_OPTIONS[draft.type] ? (
                          <select
                            value={draft.size}
                            onChange={e => setDraft(d => ({ ...d, size: e.target.value }))}
                            style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                          >
                            <option value="">— select size —</option>
                            {SIZE_OPTIONS[draft.type].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input
                            value={draft.size}
                            onChange={e => setDraft(d => ({ ...d, size: e.target.value }))}
                            style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                          />
                        )}
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Gender/Age</label>
                        <select
                          value={draft.gender_age}
                          onChange={e => setDraft(d => ({ ...d, gender_age: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}
                        >
                          <option value="">— select —</option>
                          {GENDER_AGE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: '#64748b' }}>Quantity on hand: <strong>{item.quantity}</strong></span>
                      <label style={{ color: '#64748b' }}>Adjust by:</label>
                      <input
                        type="number"
                        value={qtyAdjust}
                        onChange={e => setQtyAdjust(e.target.value)}
                        placeholder="e.g. 3 or -2"
                        style={{ width: 90, padding: '4px 6px', fontSize: 13 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleAdjustQty(item.id)}
                        style={{ padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}
                      >
                        Apply
                      </button>
                      {qtyError && <span role="alert" style={{ color: '#ef4444' }}>{qtyError}</span>}
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
                        disabled={item.label_printed || item.status !== 'available'}
                        title={item.label_printed ? 'Cannot delete after labels are printed' : item.status !== 'available' ? 'Cannot delete an item that has been sold' : ''}
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', color: (item.label_printed || item.status !== 'available') ? '#94a3b8' : '#ef4444', cursor: (item.label_printed || item.status !== 'available') ? 'default' : 'pointer', fontSize: 13 }}
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
