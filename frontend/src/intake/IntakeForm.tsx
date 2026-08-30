/**
 * Intake session creation form — captures donation preferences
 * (donate_unsold, donate_proceeds) and submits to the intakes API.
 *
 * @module IntakeForm
 */
import { useEffect, useState, type FormEvent } from 'react'
import { createIntake } from '../api/intakes'
import type { Seller, Intake } from '../types'

/**
 * Form component for creating a new intake session for a seller.
 * Presents two optional donation preference checkboxes and calls the intakes API on submit.
 *
 * @param props.seller - The seller for whom the intake is being created.
 * @param props.onCreated - Callback invoked with the newly created {@link Intake} on success.
 */
export function IntakeForm({ seller, onCreated }: {
  seller: Seller
  onCreated: (intake: Intake) => void
}) {
  const [donateProceeds, setDonateProceeds] = useState(seller.donate_proceeds_default ?? false)
  const [donateUnsold, setDonateUnsold] = useState(seller.donate_unsold_default ?? false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // When the selected seller changes, re-seed the donation checkboxes from that
  // seller's per-seller defaults (intake inherits these unless overridden here).
  useEffect(() => {
    setDonateProceeds(seller.donate_proceeds_default ?? false)
    setDonateUnsold(seller.donate_unsold_default ?? false)
  }, [seller.id, seller.donate_proceeds_default, seller.donate_unsold_default])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const intake = await createIntake({
        seller_id: seller.id,
        donate_proceeds: donateProceeds,
        donate_unsold: donateUnsold,
      })
      onCreated(intake)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create intake')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>New Intake — {seller.is_vendor ? (seller.company ?? seller.code) : [seller.first_name, seller.last_name].filter(Boolean).join(' ')} ({seller.code})</h3>
      <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: 4, padding: '10px 12px', marginBottom: 10 }}>
        <legend style={{ fontSize: 13, color: '#64748b' }}>Donation preferences (default for this intake's items)</legend>
        <div style={{ marginBottom: 10 }}>
          <label>
            <input type="checkbox" id="donateProceeds" checked={donateProceeds} onChange={e => setDonateProceeds(e.target.checked)} />
            {' '}Donate proceeds (MYSL keeps 100% of sale price)
          </label>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>
            <input type="checkbox" id="donateUnsold" checked={donateUnsold} onChange={e => setDonateUnsold(e.target.checked)} />
            {' '}Donate unsold items
          </label>
          </div>
        {/* Inheritance visibility: the checkboxes above are pre-seeded from the
            seller's registration defaults; items inherit them unless overridden. */}
        <div style={{ fontSize: 11, color: '#64748b' }}>
          Pre-filled from {seller.is_vendor ? (seller.company ?? seller.code) : [seller.first_name, seller.last_name].filter(Boolean).join(' ')}'s registration — items inherit these unless overridden per item.
        </div>
      </fieldset>
      {error && <div role="alert" style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
      <button type="submit" disabled={loading}>Start Intake</button>
    </form>
  )
}
