import { apiFetch } from './client'
import type { SaleWithItemsResponse, SaleCreate } from '../types'

export const createSale = (data: SaleCreate) =>
  apiFetch<SaleWithItemsResponse>('/sales', { method: 'POST', body: JSON.stringify(data) })
export const getSale = (id: number) => apiFetch<SaleWithItemsResponse>(`/sales/${id}`)
export const voidSale = (id: number) =>
  apiFetch<SaleWithItemsResponse>(`/sales/${id}/void`, { method: 'POST' })
