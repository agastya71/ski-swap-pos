/**
 * Items API — fetch, update, delete, and look up individual consignment items.
 * Lookup and search are available to all roles; write operations require admin or intake.
 */
import { apiFetch, getToken } from './client'
import type { Item, ItemUpdate, ItemLookupResponse } from '../types'

/**
 * Fetch a single item by primary key.
 *
 * @param id - Primary key of the item to retrieve.
 * @returns The matching Item record.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getItem = (id: number) => apiFetch<Item>(`/items/${id}`)

/**
 * Update an existing item's fields.
 *
 * @param id - Primary key of the item to update.
 * @param data - Partial item fields to update.
 * @returns The updated Item record.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const updateItem = (id: number, data: ItemUpdate) =>
  apiFetch<Item>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

/**
 * Permanently delete an item record.
 * Only permitted for items that have not been sold.
 *
 * @param id - Primary key of the item to delete.
 * @throws {ApiError} 409 if the item has already been sold.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const deleteItem = (id: number) =>
  apiFetch<void>(`/items/${id}`, { method: 'DELETE' })

/**
 * Adjust an item's on-hand quantity by a signed delta.
 *
 * Positive values increase the quantity by the difference; negative values
 * decrease it (the resulting quantity may not go below zero, i.e. fewer total
 * units than already sold).
 *
 * @param id - Primary key of the item to adjust.
 * @param adjustment - Signed integer to add to (or subtract from) the quantity.
 * @returns The updated Item record.
 * @throws {ApiError} 422 if the adjustment would reduce quantity below zero.
 * @throws {ApiError} 404 if no item with the given ID exists.
 */
export const adjustItemQuantity = (id: number, adjustment: number) =>
  apiFetch<Item>(`/items/${id}/quantity`, { method: 'PATCH', body: JSON.stringify({ adjustment }) })

/**
 * Fetch distinct brand names for the active event, optionally filtered by prefix.
 * Used by the item-entry brand typeahead to suggest close alternatives.
 *
 * @param q - Partial brand string to filter by (case-insensitive).
 * @returns Array of matching brand names; may be empty.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const fetchBrands = (q: string) =>
  apiFetch<string[]>(`/items/brands?q=${encodeURIComponent(q)}`)

/**
 * Send a ZPL barcode label for one item to the label printer.
 *
 * @param id - Primary key of the item whose label should be printed.
 * @returns The updated Item record with `label_printed: true`.
 * @throws {ApiError} 404 if no item with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const printLabel = (id: number) =>
  apiFetch<Item>(`/items/${id}/label`, { method: 'POST' })

/**
 * Exact-match item lookup by code — the fast path for barcode scanners.
 *
 * @param code - Exact item code to look up, e.g. "A001-003".
 * @returns The matching ItemLookupResponse (item fields + seller_code).
 * @throws {ApiError} 404 if no item with that exact code exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const lookupItem = (code: string) =>
  apiFetch<ItemLookupResponse>(`/items/lookup?code=${encodeURIComponent(code)}`)

/**
 * Partial-match item search — autocomplete path for manual code entry.
 * Returns items whose code, description, or category contain the query string.
 *
 * @param q - Search string (partial code, description, or category).
 * @returns Array of matching ItemLookupResponse records; may be empty.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const searchItems = (q: string) =>
  apiFetch<ItemLookupResponse[]>(`/items/search?q=${encodeURIComponent(q)}`)

/**
 * Trigger a download of the blank Excel import template.
 * Opens the file in the browser's native download handler.
 * @throws {Error} if the request fails or the server returns a non-OK status.
 */
export function downloadImportTemplate(): Promise<void> {
  const token = getToken()
  return fetch('/items/import-template', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async r => {
      if (!r.ok) throw new Error(`Template download failed: ${r.statusText}`)
      const buf = await r.arrayBuffer()
      return new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    })
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'import-template.xlsx'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    })
}
