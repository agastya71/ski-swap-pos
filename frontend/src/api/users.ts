import { apiFetch } from './client'
import type { User, UserCreate } from '../types'

export const getUsers = () => apiFetch<User[]>('/users')
export const createUser = (data: UserCreate) =>
  apiFetch<User>('/users', { method: 'POST', body: JSON.stringify(data) })
export const deactivateUser = (id: number) =>
  apiFetch<User>(`/users/${id}/deactivate`, { method: 'PATCH' })
