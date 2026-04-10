/**
 * Sales API — create, fetch, and void point-of-sale transactions.
 * Requires cashier or admin role.
 */
import { apiFetch } from './client'
import type { SaleWithItemsResponse, SaleCreate } from '../types'

/**
 * Create a new sale transaction.
 * Marks all included items as sold and calculates commission splits.
 *
 * @param data - Items, payment amounts, and optional customer details.
 * @returns The completed SaleWithItemsResponse including all line items and totals.
 * @throws {ApiError} 409 if any included item is not in 'available' status.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createSale = (data: SaleCreate) =>
  apiFetch<SaleWithItemsResponse>('/sales', { method: 'POST', body: JSON.stringify(data) })

/**
 * Fetch a completed sale by primary key.
 *
 * @param id - Primary key of the sale to retrieve.
 * @returns The SaleWithItemsResponse including all line items.
 * @throws {ApiError} 404 if no sale with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getSale = (id: number) => apiFetch<SaleWithItemsResponse>(`/sales/${id}`)

/**
 * Void a sale, returning all its line items to 'available' status so they can be re-sold.
 *
 * @param id - Primary key of the sale to void.
 * @returns The updated SaleWithItemsResponse with `is_voided: true`.
 * @throws {ApiError} 404 if no sale with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const voidSale = (id: number) =>
  apiFetch<SaleWithItemsResponse>(`/sales/${id}/void`, { method: 'POST' })
