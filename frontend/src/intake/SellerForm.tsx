import { useState, type FormEvent } from 'react'
import { createSeller } from '../api/sellers'
import type { Seller } from '../types'

export function SellerForm({ onCreated, onCancel }: {
  onCreated: (seller: Seller) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [isVendor, setIsVendor] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const seller = await createSeller({
        code,
        first_name: firstName,
        last_name: lastName,
        company: company || undefined,
        phone: phone || undefined,
        email: email || undefined,
        is_vendor: isVendor,
      })
      onCreated(seller)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register seller')
    } finally {
      setLoading(false)
    }
  }

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, required = false) => (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: 3 }}>{label}</label>
      <input id={id} value={value} onChange={e => onChange(e.target.value)} required={required} style={{ width: '100%', padding: 6, boxSizing: 'border-box' }} />
    </div>
  )

  return (
    <form onSubmit={handleSubmit}>
      <h3>Register New Seller</h3>
      {field('sellerCode', 'Seller Code', code, setCode, true)}
      {field('firstName', 'First Name', firstName, setFirstName, true)}
      {field('lastName', 'Last Name', lastName, setLastName, true)}
      {field('company', 'Company (optional)', company, setCompany)}
      {field('phone', 'Phone (optional)', phone, setPhone)}
      {field('email', 'Email (optional)', email, setEmail)}
      <div style={{ marginBottom: 10 }}>
        <label>
          <input type="checkbox" checked={isVendor} onChange={e => setIsVendor(e.target.checked)} />
          {' '}Vendor (not individual consignor)
        </label>
      </div>
      {error && <div role="alert" style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={loading}>Register</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
