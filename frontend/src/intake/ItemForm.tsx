import { useState, type FormEvent } from 'react'
import { addItem } from '../api/intakes'
import type { Item } from '../types'

const CATEGORIES = ['Skis', 'Ski Boots', 'Ski Poles', 'Snowboard', 'Snowboard Boots', 'Bindings', 'Helmet', 'Clothing', 'Other']

function suggestCode(sellerCode: string, itemCount: number) {
  if (!sellerCode) return ''
  return `${sellerCode}-${String(itemCount + 1).padStart(3, '0')}`
}

const emptyForm = (code = '') => ({
  code, category: '', brand: '', type: '', description: '', color: '',
  size: '', uom: '', gender_age: '', year: '', used: false, price: '', donate_unsold: false,
})

export function ItemForm({ intakeId, onAdded, sellerCode = '', itemCount = 0 }: {
  intakeId: number
  onAdded: (item: Item) => void
  sellerCode?: string
  itemCount?: number
}) {
  const [f, setF] = useState(() => emptyForm(suggestCode(sellerCode, itemCount)))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function set(k: keyof ReturnType<typeof emptyForm>, v: string | boolean) {
    setF(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const item = await addItem(intakeId, {
        code: f.code,
        category: f.category || undefined,
        brand: f.brand || undefined,
        type: f.type || undefined,
        description: f.description || undefined,
        color: f.color || undefined,
        size: f.size || undefined,
        uom: f.uom || undefined,
        gender_age: f.gender_age || undefined,
        year: f.year ? parseInt(f.year) : undefined,
        used: f.used,
        price: parseFloat(f.price),
        donate_unsold: f.donate_unsold,
      })
      onAdded(item)
      setF(emptyForm(suggestCode(sellerCode, itemCount + 1)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setLoading(false)
    }
  }

  const text = (id: keyof ReturnType<typeof emptyForm>, label: string, required = false) => (
    <div style={{ marginBottom: 8 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>{label}</label>
      <input id={id} value={f[id] as string} onChange={e => set(id, e.target.value)} required={required} style={{ width: '100%', padding: 5, boxSizing: 'border-box' }} />
    </div>
  )

  return (
    <form onSubmit={handleSubmit}>
      <h4>Add Item</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        {text('code', 'Code *', true)}
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="category" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Category *</label>
          <select id="category" value={f.category} onChange={e => set('category', e.target.value)} required style={{ width: '100%', padding: 5 }}>
            <option value="">— select —</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {text('brand', 'Brand')}
        {text('type', 'Type')}
        {text('description', 'Description')}
        {text('color', 'Color')}
        {text('size', 'Size')}
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="gender_age" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Gender/Age</label>
          <select id="gender_age" value={f.gender_age} onChange={e => set('gender_age', e.target.value)} style={{ width: '100%', padding: 5 }}>
            <option value="">— select —</option>
            {['Adult', 'Youth', 'Toddler', 'Unisex'].map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {text('year', 'Year')}
        <div style={{ marginBottom: 8 }}>
          <label htmlFor="price" style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>Price *</label>
          <input id="price" type="number" min="0" step="0.01" value={f.price} onChange={e => set('price', e.target.value)} required style={{ width: '100%', padding: 5, boxSizing: 'border-box' }} />
        </div>
      </div>
      <div style={{ marginBottom: 10, display: 'flex', gap: 16 }}>
        <label>
          <input type="checkbox" checked={f.used} onChange={e => set('used', e.target.checked)} />
          {' '}Used item
        </label>
        <label>
          <input type="checkbox" checked={f.donate_unsold} onChange={e => set('donate_unsold', e.target.checked)} />
          {' '}Donate if unsold (override intake preference)
        </label>
      </div>
      {error && <div role="alert" style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <button type="submit" disabled={loading}>Add Item</button>
    </form>
  )
}
