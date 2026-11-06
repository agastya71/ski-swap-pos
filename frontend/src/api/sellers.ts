/**
 * Sellers API — search, fetch, register, update, and reprint labels.
 * Admin-only features: delete, seller-level label reprint.
 */
import { apiFetch, apiFetchText } from './client'
import type { Seller, SellerCreate, SellerUpdate, Item } from '../types'

/**
 * Search sellers by partial code, first/last name, or company.
 *
 * @param q - Search string matched against seller code and name fields.
 * @returns Array of matching Seller records for the active event.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const searchSellers = (q: string) =>
  apiFetch<Seller[]>(`/sellers?q=${encodeURIComponent(q)}`)

/**
 * Fetch a single seller by primary key.
 *
 * @param id - Primary key of the seller to retrieve.
 * @returns The matching Seller record.
 * @throws {ApiError} 404 if no seller with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSeller = (id: number) => apiFetch<Seller>(`/sellers/${id}`)

/**
 * Register a new consignment seller for the active event.
 *
 * @param data - Seller details including required first name and last name.
 * @returns The newly created Seller record.
 * @throws {ApiError} 409 if a seller with the same code already exists for this event.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createSeller = (data: SellerCreate) =>
  apiFetch<Seller>('/sellers', { method: 'POST', body: JSON.stringify(data) })

/**
 * Update a seller's contact details.
 *
 * @param id - Primary key of the seller to update.
 * @param data - Partial seller fields to update.
 * @returns The updated Seller record.
 * @throws {ApiError} 404 if no seller with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const updateSeller = (id: number, data: SellerUpdate) =>
  apiFetch<Seller>(`/sellers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

/**
 * List all items for a seller in the active event.
 *
 * @param sellerId - Primary key of the seller.
 * @returns Array of Item records ordered by item code.
 */
export const listSellerItems = (sellerId: number) =>
  apiFetch<Item[]>(`/sellers/${sellerId}/items`)

/**
 * Permanently delete an erroneous seller record (admin only, backend-enforced).
 *
 * Intended for records created by mistake (mis-typed name, duplicate
 * registration). The backend hard-deletes the seller together with its
 * (empty) intake sessions and refuses with 409 while the seller still has
 * any items — those must be deleted or reassigned first.
 *
 * @param id - Primary key of the seller to delete.
 * @returns Summary of what was removed (id, code, display name).
 * @throws {ApiError} 409 if the seller still has items (including soft-deleted ones).
 * @throws {ApiError} 404 if no seller with the given ID exists in the active event.
 * @throws {ApiError} 403 if the signed-in role is not admin.
 */
export const deleteSeller = (id: number) =>
  apiFetch<{ deleted: number; code: string; name: string }>(`/sellers/${id}`, {
    method: 'DELETE',
  })

/**
 * Print every remaining item's labels across ALL of a seller's intake
 * sessions on the server-attached Zebra — the admin seller-level reprint.
 *
 * One tag per on-hand remaining unit; sold-out and soft-deleted items emit
 * nothing. Reprints never touch `label_printed` (see the seller router).
 *
 * @param sellerId - Primary key of the seller.
 * @param codeAsText - When true, each item's code prints as large text instead
 *   of a barcode (`?code_as_text=true`).
 * @returns Object with `seller_id` and `printed` count of label batches sent.
 * @throws {ApiError} 404 if the seller is unknown in the active event or has
 *   nothing left in stock.
 * @throws {ApiError} 403 if the signed-in role is not admin.
 * @throws {ApiError} 503 if the label printer is unavailable.
 */
export const printSellerLabels = (sellerId: number, codeAsText?: boolean) =>
  apiFetch<{ seller_id: number; printed: number }>(
    `/sellers/${sellerId}/labels${codeAsText ? '?code_as_text=true' : ''}`,
    { method: 'POST' },
  )

/**
 * Fetch the concatenated raw ZPL for every remaining item across ALL of a
 * seller's intake sessions, WITHOUT sending it to the server printer
 * (client-side printing path, mirrors the intake labels.zpl endpoint).
 *
 * Read-only: reprints have no ack companion, so nothing marks state.
 *
 * @param sellerId - Primary key of the seller.
 * @param codeAsText - When true, each item's code prints as large text.
 * @param dx - Optional geometry nudge (dots) for the Browser-Print agent path.
 * @param dy - Optional geometry nudge (dots) for the Browser-Print agent path.
 * @returns Raw ZPL text.
 * @throws {ApiError} 404 if the seller is unknown in the active event or has
 *   nothing left in stock.
 * @throws {ApiError} 403 if the signed-in role is not admin.
 */
export const fetchSellerLabelsZpl = (
  sellerId: number,
  codeAsText?: boolean,
  dx?: number,
  dy?: number,
) => {
  const params = new URLSearchParams()
  if (codeAsText) params.set('code_as_text', 'true')
  if (dx) params.set('dx', String(dx))
  if (dy) params.set('dy', String(dy))
  const qs = params.toString()
  return apiFetchText(`/sellers/${sellerId}/labels.zpl${qs ? `?${qs}` : ''}`)
}
