import type { ItemLookupResponse } from '../types'

export function Cart({ items, onRemove }: {
  items: ItemLookupResponse[]
  onRemove: (id: number) => void
}) {
  const total = items.reduce((sum, i) => sum + i.price, 0)

  if (items.length === 0) {
    return <p style={{ color: '#888', fontStyle: 'italic' }}>Cart is empty. Scan an item to begin.</p>
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc', fontSize: 13, color: '#555' }}>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Code</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Seller</th>
            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Description</th>
            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Price</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '6px 8px' }}>{item.code}</td>
              <td style={{ padding: '6px 8px' }}>{item.seller_code}</td>
              <td style={{ padding: '6px 8px' }}>{item.description ?? '—'}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>${item.price.toFixed(2)}</td>
              <td style={{ padding: '6px 8px' }}>
                <button onClick={() => onRemove(item.id)} style={{ fontSize: 12, cursor: 'pointer' }}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 20 }}>
        Total: <span>${total.toFixed(2)}</span>
      </div>
    </div>
  )
}
