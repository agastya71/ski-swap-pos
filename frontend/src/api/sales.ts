import { apiFetch } from './client'
import type { Sale, SaleCreate } from '../types'

export const createSale = (data: SaleCreate) =>
  apiFetch<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) })
export const getSale = (id: number) => apiFetch<Sale>(`/sales/${id}`)
export const voidSale = (id: number) =>
  apiFetch<Sale>(`/sales/${id}/void`, { method: 'POST' })
