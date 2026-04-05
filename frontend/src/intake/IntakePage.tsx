import { useState, useCallback } from 'react'
import { getIntake, getSellerIntakes } from '../api/intakes'
import { SellerSearch } from './SellerSearch'
import { SellerForm } from './SellerForm'
import { IntakeForm } from './IntakeForm'
import { ItemForm } from './ItemForm'
import { ItemList } from './ItemList'
import type { Seller, Intake, Item } from '../types'

type Step = 'search' | 'register' | 'select-intake' | 'intake' | 'items'

function Breadcrumb({ step, seller, intake, onGoToSearch, onGoToSelectIntake }: {
  step: Step
  seller: Seller | null
  intake: Intake | null
  onGoToSearch: () => void
  onGoToSelectIntake: () => void
}) {
  const linkStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#1a237e', padding: 0, fontSize: 13, textDecoration: 'underline',
  }
  const sep = <span style={{ margin: '0 6px', color: '#999' }}>&rsaquo;</span>

  return (
    <nav aria-label="breadcrumb" style={{ fontSize: 13, marginBottom: 16, color: '#666' }}>
      {step === 'search'
        ? <span style={{ color: '#333', fontWeight: 600 }}>Intake</span>
        : <button style={linkStyle} onClick={onGoToSearch}>Intake</button>
      }

      {step === 'register' && <>{sep}<span style={{ color: '#333' }}>Register New Seller</span></>}

      {seller && (step === 'select-intake' || step === 'intake' || step === 'items') && (
        <>
          {sep}
          {(step === 'intake' || step === 'items')
            ? <button style={linkStyle} onClick={onGoToSelectIntake}>{seller.first_name} {seller.last_name} ({seller.code})</button>
            : <span style={{ color: '#333' }}>{seller.first_name} {seller.last_name} ({seller.code})</span>
          }
        </>
      )}

      {step === 'intake' && <>{sep}<span style={{ color: '#333' }}>New Intake</span></>}
      {step === 'items' && intake && <>{sep}<span style={{ color: '#333' }}>Intake #{intake.id}</span></>}
    </nav>
  )
}

export function IntakePage() {
  const [step, setStep] = useState<Step>('search')
  const [seller, setSeller] = useState<Seller | null>(null)
  const [intake, setIntake] = useState<Intake | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [sellerIntakes, setSellerIntakes] = useState<Intake[]>([])
  const [loadingIntakes, setLoadingIntakes] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  const refreshItems = useCallback(async () => {
    if (!intake) return
    const fresh = await getIntake(intake.id)
    setItems(fresh.items)
  }, [intake])

  async function goToSelectIntake(s: Seller) {
    setSeller(s)
    setStep('select-intake')
    setLoadingIntakes(true)
    setPickError(null)
    try {
      const intakes = await getSellerIntakes(s.id)
      setSellerIntakes(intakes)
    } catch {
      setSellerIntakes([])
    } finally {
      setLoadingIntakes(false)
    }
  }

  function handleSellerSelected(s: Seller) { goToSelectIntake(s) }
  function handleSellerCreated(s: Seller) { goToSelectIntake(s) }

  async function handlePickExistingIntake(intakeId: number) {
    setPickError(null)
    try {
      const full = await getIntake(intakeId)
      setIntake(full)
      setItems(full.items)
      setStep('items')
    } catch {
      setPickError('Failed to load intake. Please try again.')
    }
  }

  function handleIntakeCreated(i: Intake) {
    setIntake(i)
    setItems([])
    setStep('items')
    getIntake(i.id).then(full => setItems(full.items)).catch(() => {})
  }

  function handleGoToSearch() {
    setSeller(null)
    setIntake(null)
    setItems([])
    setSellerIntakes([])
    setPickError(null)
    setStep('search')
  }

  function handleGoToSelectIntake() {
    if (!seller) { handleGoToSearch(); return }
    setIntake(null)
    setItems([])
    goToSelectIntake(seller)
  }

  function handleItemAdded(item: Item) {
    setItems(prev => [...prev, item])
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h2 style={{ marginBottom: 4 }}>Intake</h2>
      <Breadcrumb
        step={step}
        seller={seller}
        intake={intake}
        onGoToSearch={handleGoToSearch}
        onGoToSelectIntake={handleGoToSelectIntake}
      />

      {step === 'search' && (
        <SellerSearch onSelect={handleSellerSelected} onCreateNew={() => setStep('register')} />
      )}

      {step === 'register' && (
        <SellerForm onCreated={handleSellerCreated} onCancel={() => setStep('search')} />
      )}

      {step === 'select-intake' && seller && (
        <div>
          <h3 style={{ marginTop: 0 }}>
            {seller.first_name} {seller.last_name}
            <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 8, color: '#666' }}>({seller.code})</span>
          </h3>
          {pickError && <div role="alert" style={{ color: 'red', marginBottom: 8 }}>{pickError}</div>}
          {loadingIntakes ? (
            <p>Loading previous intakes…</p>
          ) : sellerIntakes.length > 0 ? (
            <>
              <p style={{ fontWeight: 500, marginBottom: 8 }}>Previous intakes — click Continue to add more items:</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc', fontSize: 13 }}>
                    <th style={{ padding: '4px 8px' }}>Intake #</th>
                    <th style={{ padding: '4px 8px' }}>Date</th>
                    <th style={{ padding: '4px 8px' }}>Donate Unsold</th>
                    <th style={{ padding: '4px 8px' }}>Donate Proceeds</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sellerIntakes.map(i => (
                    <tr key={i.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '6px 8px' }}>#{i.id}</td>
                      <td style={{ padding: '6px 8px' }}>{i.date_entered}</td>
                      <td style={{ padding: '6px 8px' }}>{i.donate_unsold ? 'Yes' : 'No'}</td>
                      <td style={{ padding: '6px 8px' }}>{i.donate_proceeds ? 'Yes' : 'No'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <button onClick={() => handlePickExistingIntake(i.id)}>Continue</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p style={{ color: '#666' }}>No previous intakes for this seller.</p>
          )}
          <button
            onClick={() => setStep('intake')}
            style={{ padding: '10px 24px', background: '#1a237e', color: 'white', border: 'none', cursor: 'pointer', borderRadius: 3 }}
          >
            + New Intake
          </button>
        </div>
      )}

      {step === 'intake' && seller && (
        <IntakeForm seller={seller} onCreated={handleIntakeCreated} />
      )}

      {step === 'items' && intake && (
        <div>
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
