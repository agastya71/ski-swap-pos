/**
 * Admin seller detail page — contact card with inline edit, items table,
 * Add Item form, and Excel import.
 *
 * @module SellerDetailPage
 */
import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { updateSeller, listSellerItems } from '../api/sellers'
import { getSellerIntakes, createIntake, importItems } from '../api/intakes'
import { deleteItem } from '../api/items'
import { ItemForm } from '../intake/ItemForm'
import type { Seller, Item, Intake, ImportResult } from '../types'

const NAVY = '#1e3a8a'

/**
 * Admin seller detail page — shows a contact card with inline editing,
 * a table of all the seller's items, and buttons for adding items and
 * importing from Excel.
 *
 * @param props.seller - The seller to display (initial value; updated after inline edit).
 * @param props.onBack - Callback invoked when the user clicks the Back button.
 */
export function SellerDetailPage({ seller: initialSeller, onBack }: {
  seller: Seller
  onBack: () => void
}) {
  const [seller, setSeller] = useState<Seller>(initialSeller)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Seller>(initialSeller)
  const [items, setItems] = useState<Item[]>([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [addItemIntakeId, setAddItemIntakeId] = useState<number | null>(null)
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    } catch {
      // deletion failed — leave item in list
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
            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
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
                {!item.label_printed && item.status === 'available' && (
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
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
    </div>
  )
}
