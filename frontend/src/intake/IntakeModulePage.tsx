import { useState } from 'react'
import { IntakePage } from './IntakePage'
import { SellerListPage } from '../admin/SellerListPage'
import { SellerDetailPage } from '../admin/SellerDetailPage'
import type { Seller } from '../types'

type IntakeTab = 'intake' | 'sellers'

/**
 * Top-level intake module page — tab-based navigation between the seller intake
 * workflow and the full sellers list/detail view (accessible to admin and intake roles).
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #1a237e', paddingBottom: 8 }}>
        {tabBtn('intake', 'Intake')}
        {tabBtn('sellers', 'Sellers')}
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
