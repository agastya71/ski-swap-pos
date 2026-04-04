import { useState, useCallback } from 'react'
import { getIntake } from '../api/intakes'
import { SellerSearch } from './SellerSearch'
import { SellerForm } from './SellerForm'
import { IntakeForm } from './IntakeForm'
import { ItemForm } from './ItemForm'
import { ItemList } from './ItemList'
import type { Seller, Intake, Item } from '../types'

type Step = 'search' | 'register' | 'intake' | 'items'

export function IntakePage() {
  const [step, setStep] = useState<Step>('search')
  const [seller, setSeller] = useState<Seller | null>(null)
  const [intake, setIntake] = useState<Intake | null>(null)
  const [items, setItems] = useState<Item[]>([])

  const refreshItems = useCallback(async () => {
    if (!intake) return
    const fresh = await getIntake(intake.id)
    setItems(fresh.items)
  }, [intake])

  function handleSellerSelected(s: Seller) {
    setSeller(s)
    setStep('intake')
  }

  function handleSellerCreated(s: Seller) {
    setSeller(s)
    setStep('intake')
  }

  function handleIntakeCreated(i: Intake) {
    setIntake(i)
    setItems([])
    setStep('items')
    getIntake(i.id).then(full => setItems(full.items)).catch(() => {})
  }

  function handleNewIntake() {
    setSeller(null)
    setIntake(null)
    setItems([])
    setStep('search')
  }

  function handleItemAdded(item: Item) {
    setItems(prev => [...prev, item])
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h2>Intake</h2>

      {step === 'search' && (
        <SellerSearch onSelect={handleSellerSelected} onCreateNew={() => setStep('register')} />
      )}

      {step === 'register' && (
        <SellerForm onCreated={handleSellerCreated} onCancel={() => setStep('search')} />
      )}

      {step === 'intake' && seller && (
        <IntakeForm seller={seller} onCreated={handleIntakeCreated} />
      )}

      {step === 'items' && intake && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <strong>{seller?.first_name} {seller?.last_name}</strong> — Intake #{intake.id}
            </div>
            <button onClick={handleNewIntake}>New Intake</button>
          </div>
          <ItemForm
            intakeId={intake.id}
            onAdded={handleItemAdded}
            sellerCode={seller?.code ?? ''}
            itemCount={items.length}
          />
          <hr style={{ margin: '16px 0' }} />
          <ItemList items={items} intakeId={intake.id} onItemsChanged={refreshItems} />
        </div>
      )}
    </div>
  )
}
