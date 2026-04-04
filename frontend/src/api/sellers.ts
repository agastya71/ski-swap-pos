import { apiFetch } from './client'
import type { Seller, SellerCreate, SellerUpdate } from '../types'

export const searchSellers = (q: string) =>
  apiFetch<Seller[]>(`/sellers?q=${encodeURIComponent(q)}`)
export const getSeller = (id: number) => apiFetch<Seller>(`/sellers/${id}`)
export const createSeller = (data: SellerCreate) =>
  apiFetch<Seller>('/sellers', { method: 'POST', body: JSON.stringify(data) })
export const updateSeller = (id: number, data: SellerUpdate) =>
  apiFetch<Seller>(`/sellers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
