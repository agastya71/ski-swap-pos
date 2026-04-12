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
