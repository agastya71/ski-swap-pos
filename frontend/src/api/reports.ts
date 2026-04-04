import { apiFetch, getToken } from './client'
import type { SellerPayoutReport, EventRevenueReport, DonationsReport, UnsoldItemsReport, EndOfDayResult } from '../types'

export const getSellerPayouts = () =>
  apiFetch<SellerPayoutReport>('/reports/seller-payouts')
export const getEventRevenue = () =>
  apiFetch<EventRevenueReport>('/reports/event-revenue')
export const getDonations = () =>
  apiFetch<DonationsReport>('/reports/donations')
export const getUnsoldItems = () =>
  apiFetch<UnsoldItemsReport>('/reports/unsold-items')
export const markUnsold = (action: 'donate' | 'return') =>
  apiFetch<EndOfDayResult>('/end-of-day/mark-unsold', {
    method: 'POST',
    body: JSON.stringify({ action }),
  })

export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken()
  const res = await fetch(path, {
    method: path.includes('backup') ? 'POST' : 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
