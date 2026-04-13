/**
 * Admin seller detail page — contact card with inline edit, items table,
 * Add Item form, Excel import, and inline payout panel.
 *
 * @module SellerDetailPage
 */
import { Fragment, useState, useEffect, useRef, type ChangeEvent } from 'react'
import { updateSeller, listSellerItems } from '../api/sellers'
import { getSellerIntakes, createIntake, importItems } from '../api/intakes'
import { deleteItem, updateItem } from '../api/items'
import { ItemForm } from '../intake/ItemForm'
import { SellerPayoutPanel } from './SellerPayoutPanel'
import { ITEM_TYPES, SIZE_OPTIONS } from '../lib/itemSizes'
import type { Seller, Item, Intake, ImportResult, ItemUpdate } from '../types'

const NAVY = '#1e3a8a'
const GENDER_AGE_OPTIONS = ['Adult', 'Youth', 'Toddler', 'Unisex']

export function SellerDetailPage({ seller: initialSeller, onBack, eventId }: {
  seller: Seller
  onBack: () => void
  eventId: number
}) {
  const [seller, setSeller] = useState<Seller>(initialSeller)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Seller>(initialSeller)
  const [items, setItems] = useState<Item[]>([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [addItemIntakeId, setAddItemIntakeId] = useState<number | null>(null)
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [showPayout, setShowPayout] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [expandedEditId, setExpandedEditId] = useState<number | null>(null)
  const [draft, setDraft] = useState({ description: '', price: '', brand: '', type: '', size: '', gender_age: '', color: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    listSellerItems(seller.id).then(setItems).catch(() => {})
    getSellerIntakes(seller.id).then(setIntakes).catch(() => {})
  }, [seller.id])

  async function handleSaveEdit() {
    try {
      const updated = await updateSeller(seller.id, {
        first_name: editDraft.first_name,
        last_name: editDraft.last_name,
        company: editDraft.company ?? undefined,
        phone: editDraft.phone ?? undefined,
        email: editDraft.email ?? undefined,
        address: editDraft.address ?? undefined,
        city: editDraft.city ?? undefined,
        state: editDraft.state ?? undefined,
        zip: editDraft.zip ?? undefined,
      })
      setSeller(updated)
      setEditing(false)
    } catch {
      // keep editing open so the user can retry
    }
  }

  async function handleDeleteItem(itemId: number) {
    try {
      await deleteItem(itemId)
      setItems(prev => prev.filter(i => i.id !== itemId))
      setExpandedEditId(null)
    } catch {
      // deletion failed — leave item in list
    }
  }

  function openItemEdit(item: Item) {
    if (expandedEditId === item.id) { setExpandedEditId(null); return }
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

  async function handleItemSave(itemId: number) {
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
      listSellerItems(seller.id).then(setItems).catch(() => {})
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function getOrCreateIntakeId(): Promise<number> {
    if (intakes.length > 0) return intakes[0].id
    const intake = await createIntake({ seller_id: seller.id })
    setIntakes([intake])
    return intake.id
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const intakeId = await getOrCreateIntakeId()
    const result = await importItems(intakeId, file)
    setImportResult(result)
    if (result.imported > 0) {
      listSellerItems(seller.id).then(setItems).catch(() => {})
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const contactField = (label: string, value: string | null) => (
    <div style={{ marginBottom: 4 }}>
      <span style={{ color: '#64748b', fontSize: 13, marginRight: 6 }}>{label}:</span>
      <span>{value ?? '—'}</span>
    </div>
  )

  return (
    <div>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{ border: 'none', background: 'none', color: NAVY, cursor: 'pointer', fontSize: 14 }}
          aria-label="Back"
        >
          ← Back
        </button>
        <h3 style={{ margin: 0 }}>
          <span style={{ color: NAVY, marginRight: 8 }}>{seller.code}</span>
          {seller.first_name} {seller.last_name}
          {seller.company && (
            <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8 }}>({seller.company})</span>
          )}
        </h3>
      </div>

      {/* Contact card */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 16, marginBottom: 20 }}>
        {!editing ? (
          <>
            {contactField('Phone', seller.phone)}
            {contactField('Email', seller.email)}
            {contactField(
              'Address',
              seller.address
                ? `${seller.address}, ${seller.city ?? ''} ${seller.state ?? ''} ${seller.zip ?? ''}`.trim()
                : null,
            )}
            <button
              onClick={() => { setEditDraft(seller); setEditing(true) }}
              style={{ marginTop: 8, border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 12px', cursor: 'pointer', borderRadius: 3 }}
            >
              Edit
            </button>
          </>
        ) : (
          <div>
            {(['first_name', 'last_name', 'phone', 'email', 'address', 'city', 'state', 'zip'] as const).map(f => (
              <div key={f} style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>
                  {f.replace('_', ' ')}
                </label>
                <input
                  value={(editDraft[f] as string) ?? ''}
                  onChange={e => setEditDraft(prev => ({ ...prev, [f]: e.target.value }))}
                  style={{ width: '100%', padding: '5px 8px', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={handleSaveEdit}
                style={{ background: NAVY, color: '#fff', border: 'none', padding: '5px 14px', cursor: 'pointer', borderRadius: 3 }}
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{ border: '1px solid #94a3b8', background: 'none', padding: '5px 14px', cursor: 'pointer', borderRadius: 3 }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Items table header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>Items ({items.length})</h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
          >
            Import from Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            onClick={() => setShowPayout(prev => !prev)}
            style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
          >
            Payout
          </button>
          <button
            onClick={async () => {
              const id = await getOrCreateIntakeId()
              setAddItemIntakeId(id)
              setShowAddItem(true)
            }}
            style={{ background: NAVY, color: '#fff', border: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div style={{
          background: importResult.skipped > 0 ? '#fef3c7' : '#f0fdf4',
          border: '1px solid',
          borderColor: importResult.skipped > 0 ? '#fcd34d' : '#86efac',
          borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 13,
        }}>
          Imported {importResult.imported} item{importResult.imported !== 1 ? 's' : ''}.
          {importResult.skipped > 0 && (
            ` Skipped ${importResult.skipped} row${importResult.skipped !== 1 ? 's' : ''}: ${importResult.errors.map(e => `row ${e.row}: ${e.reason}`).join('; ')}`
          )}
          <button
            onClick={() => setImportResult(null)}
            style={{ marginLeft: 8, border: 'none', background: 'none', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Add Item inline form */}
      {showAddItem && addItemIntakeId !== null && (
        <div style={{ marginBottom: 16, padding: 16, border: '1px solid #e2e8f0', borderRadius: 6 }}>
          <button
            onClick={() => { setShowAddItem(false); setAddItemIntakeId(null) }}
            style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            ✕ Cancel
          </button>
          <ItemForm
            intakeId={addItemIntakeId}
            onAdded={item => { setItems(prev => [...prev, item]); setShowAddItem(false); setAddItemIntakeId(null) }}
          />
        </div>
      )}

      {/* Items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            {['Code', 'Description', 'Category', 'Price', 'Status', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <Fragment key={item.id}>
              <tr style={{ borderBottom: expandedEditId === item.id ? 'none' : '1px solid #f1f5f9' }}>
                <td style={{ padding: '7px 8px', fontFamily: 'monospace', color: NAVY }}>{item.code}</td>
                <td style={{ padding: '7px 8px' }}>{item.description ?? '—'}</td>
                <td style={{ padding: '7px 8px', color: '#64748b' }}>{item.category ?? '—'}</td>
                <td style={{ padding: '7px 8px' }}>${item.price.toFixed(2)}</td>
                <td style={{ padding: '7px 8px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    color: item.status === 'sold' ? '#16a34a' : '#64748b',
                  }}>
                    {item.status}
                  </span>
                </td>
                <td style={{ padding: '7px 8px' }}>
                  <button
                    aria-label="Edit item"
                    onClick={() => openItemEdit(item)}
                    style={{ border: `1px solid ${NAVY}`, color: NAVY, background: 'none', padding: '2px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 12 }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
              {expandedEditId === item.id && (
                <tr>
                  <td colSpan={6} style={{ padding: '8px 16px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Description</label>
                        <input value={draft.description} maxLength={99}
                          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Price</label>
                        <input type="number" min={0} step={0.01} value={draft.price}
                          onChange={e => setDraft(d => ({ ...d, price: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Brand</label>
                        <input value={draft.brand}
                          onChange={e => setDraft(d => ({ ...d, brand: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Type</label>
                        <select value={draft.type}
                          onChange={e => setDraft(d => ({ ...d, type: e.target.value, size: d.type ? '' : d.size }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}>
                          <option value="">— select type —</option>
                          {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Size</label>
                        {SIZE_OPTIONS[draft.type] ? (
                          <select value={draft.size}
                            onChange={e => setDraft(d => ({ ...d, size: e.target.value }))}
                            style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}>
                            <option value="">— select size —</option>
                            {SIZE_OPTIONS[draft.type].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input value={draft.size}
                            onChange={e => setDraft(d => ({ ...d, size: e.target.value }))}
                            style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }} />
                        )}
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Gender/Age</label>
                        <select value={draft.gender_age}
                          onChange={e => setDraft(d => ({ ...d, gender_age: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }}>
                          <option value="">— select —</option>
                          {GENDER_AGE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 2 }}>Color</label>
                        <input value={draft.color}
                          onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
                          style={{ width: '100%', padding: '4px 6px', boxSizing: 'border-box', fontSize: 13 }} />
                      </div>
                    </div>
                    {saveError && (
                      <p role="alert" style={{ color: '#ef4444', fontSize: 12, margin: '0 0 8px' }}>{saveError}</p>
                    )}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => handleItemSave(item.id)}
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
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={item.label_printed || item.status !== 'available'}
                        title={item.label_printed ? 'Cannot delete after labels are printed' : item.status !== 'available' ? 'Cannot delete sold items' : ''}
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: 13,
                          color: (item.label_printed || item.status !== 'available') ? '#94a3b8' : '#ef4444',
                          cursor: (item.label_printed || item.status !== 'available') ? 'default' : 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>
                No items yet
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Payout panel */}
      {showPayout && (
        <div style={{ marginTop: 16, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
          <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Seller Payout</strong>
          <SellerPayoutPanel eventId={eventId} sellerId={seller.id} />
        </div>
      )}
    </div>
  )
}
