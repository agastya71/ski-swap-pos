import { useState } from 'react'
import { IntakePage } from './IntakePage'
import { SellerListPage } from '../admin/SellerListPage'
import { SellerDetailPage } from '../admin/SellerDetailPage'
import { downloadImportTemplate } from '../api/items'
import type { Seller } from '../types'

type IntakeTab = 'intake' | 'sellers'

/**
 * Top-level intake module page — tab-based navigation between the seller intake
 * workflow and the full sellers list/detail view (accessible to admin and intake roles).
 * The Download Template button is always visible in the tab bar for quick access.
 */
export function IntakeModulePage() {
  const [tab, setTab] = useState<IntakeTab>('intake')
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null)

  const tabBtn = (t: IntakeTab, label: string) => (
    <button
      key={t}
      onClick={() => setTab(t)}
      aria-current={tab === t ? 'page' : undefined}
      style={{
        padding: '6px 16px',
        background: tab === t ? '#1a237e' : 'transparent',
        color: tab === t ? 'white' : '#1a237e',
        border: '1px solid #1a237e',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1a237e', paddingBottom: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {tabBtn('intake', 'Intake')}
          {tabBtn('sellers', 'Sellers')}
        </div>
        <button
          onClick={() => downloadImportTemplate()}
          style={{ border: '1px solid #1a237e', color: '#1a237e', background: 'none', padding: '4px 10px', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
        >
          Download Template
        </button>
      </div>
      {tab === 'intake' && <IntakePage />}
      {tab === 'sellers' && (
        selectedSeller
          ? <SellerDetailPage seller={selectedSeller} onBack={() => setSelectedSeller(null)} />
          : <SellerListPage onSelectSeller={setSelectedSeller} />
      )}
    </div>
  )
}
