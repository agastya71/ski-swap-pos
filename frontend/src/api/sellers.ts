/**
 * Sellers API — search, fetch, register, and update consignment sellers.
 * Requires admin or intake role.
 */
import { apiFetch } from './client'
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
