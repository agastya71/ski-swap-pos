import { deleteItem, printLabel } from '../api/items'
import { printIntakeLabels } from '../api/intakes'
import type { Item } from '../types'

export function ItemList({ items, intakeId, onItemsChanged }: {
  items: Item[]
  intakeId: number
  onItemsChanged: () => void
}) {
  async function handleDelete(id: number) {
    await deleteItem(id)
    onItemsChanged()
  }

  async function handlePrintOne(id: number) {
    await printLabel(id)
    onItemsChanged()
  }

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
            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 8px' }}>{item.code}</td>
              <td style={{ padding: '4px 8px' }}>{item.category}</td>
              <td style={{ padding: '4px 8px' }}>{[item.brand, item.description].filter(Boolean).join(' — ') || '—'}</td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
              <td style={{ padding: '4px 8px' }}>{item.label_printed ? '✓ printed' : '—'}</td>
              <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                <button onClick={() => handlePrintOne(item.id)} style={{ marginRight: 4 }}>Print Label</button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={item.label_printed}
                  title={item.label_printed ? 'Cannot delete after labels are printed' : ''}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
