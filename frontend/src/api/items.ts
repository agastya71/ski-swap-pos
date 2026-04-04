import { apiFetch } from './client'
import type { Item, ItemUpdate, ItemLookupResponse } from '../types'

export const getItem = (id: number) => apiFetch<Item>(`/items/${id}`)
export const updateItem = (id: number, data: ItemUpdate) =>
  apiFetch<Item>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteItem = (id: number) =>
  apiFetch<void>(`/items/${id}`, { method: 'DELETE' })
export const printLabel = (id: number) =>
  apiFetch<Item>(`/items/${id}/label`, { method: 'POST' })
export const lookupItem = (code: string) =>
  apiFetch<ItemLookupResponse>(`/items/lookup?code=${encodeURIComponent(code)}`)
