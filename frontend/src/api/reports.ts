import { apiFetch, getToken } from './client'
import type {
  SellerPayoutReport,
  EventRevenueReport,
  DonationsReport,
  UnsoldItemsReport,
  EndOfDayReport,
} from '../types'

export const getSellerPayout = (eventId: number, sellerId: number) =>
  apiFetch<SellerPayoutReport>(`/reports/${eventId}/seller/${sellerId}`)
export const getEventRevenue = (eventId: number) =>
  apiFetch<EventRevenueReport>(`/reports/${eventId}/revenue`)
export const getDonations = (eventId: number) =>
  apiFetch<DonationsReport>(`/reports/${eventId}/donations`)
export const getUnsoldItems = (eventId: number) =>
  apiFetch<UnsoldItemsReport>(`/reports/${eventId}/unsold`)
export const getEndOfDay = (eventId: number) =>
  apiFetch<EndOfDayReport>(`/reports/${eventId}/end-of-day`)

export async function downloadFile(
  path: string,
  filename: string,
  method: 'GET' | 'POST' = 'GET'
): Promise<void> {
  const token = getToken()
  const res = await fetch(path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
