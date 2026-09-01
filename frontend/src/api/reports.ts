/**
 * Reports API — fetch financial and inventory reports for an event.
 * All report fetch endpoints require admin role.
 * {@link downloadFile} is a shared utility for browser file downloads.
 */
import { apiFetch, getToken } from './client'
import type {
  SellerPayoutReport,
  EventRevenueReport,
  DonationsReport,
  UnsoldItemsReport,
  EndOfDayReport,
  TransactionsByUserReport,
} from '../types'

/**
 * Fetch the payout report for a single seller.
 *
 * @param eventId - ID of the event to report on.
 * @param sellerId - ID of the seller to generate a payout for.
 * @returns Full SellerPayoutReport with per-item line items and commission totals.
 * @throws {ApiError} 404 if the event or seller does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSellerPayout = (eventId: number, sellerId: number) =>
  apiFetch<SellerPayoutReport>(`/reports/${eventId}/seller/${sellerId}`)

/**
 * Fetch the aggregate revenue report for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns EventRevenueReport with totals by payment type and commission split.
 * @throws {ApiError} 404 if the event does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getEventRevenue = (eventId: number) =>
  apiFetch<EventRevenueReport>(`/reports/${eventId}/revenue`)

/**
 * Fetch the donations report listing all donated items for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns DonationsReport with all items donated by either mechanism (donate_unsold or donate_proceeds).
 * @throws {ApiError} 404 if the event does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getDonations = (eventId: number) =>
  apiFetch<DonationsReport>(`/reports/${eventId}/donations`)

/**
 * Fetch the unsold inventory report for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns UnsoldItemsReport listing all items still in 'available' or 'returned' status.
 * @throws {ApiError} 404 if the event does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getUnsoldItems = (eventId: number) =>
  apiFetch<UnsoldItemsReport>(`/reports/${eventId}/unsold`)

/**
 * Fetch the end-of-day summary report for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns EndOfDayReport with today's sales counts, revenue, and payment breakdown.
 * @throws {ApiError} 404 if the event does not exist.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getEndOfDay = (eventId: number) =>
  apiFetch<EndOfDayReport>(`/reports/${eventId}/end-of-day`)

/**
 * Fetch the transactions-by-user report for an event.
 *
 * @param eventId - ID of the event to report on.
 * @returns TransactionsByUserReport: per-cashier transaction listings and totals.
 */
export function getTransactionsByUser(eventId: number) {
  return apiFetch<TransactionsByUserReport>(`/reports/${eventId}/transactions-by-user`)
}

/**
 * Trigger an authenticated file download (CSV, PDF, or Markdown report).
 * Creates a temporary anchor element to initiate the browser download dialog,
 * then cleans it up immediately.
 *
 * @param path - Absolute API path for the download endpoint, e.g. `/reports/1/end-of-day?format=csv`.
 * @param filename - Suggested filename for the download dialog, e.g. "end-of-day.csv".
 * @param method - HTTP method for the request; defaults to 'GET'.
 * @throws {Error} If the server returns a non-2xx response.
 */
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
