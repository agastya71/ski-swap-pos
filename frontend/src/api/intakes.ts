import { apiFetch } from './client'
import type { Intake, IntakeWithItems, IntakeCreate, IntakeUpdate, Item, ItemCreate } from '../types'

export const createIntake = (data: IntakeCreate) =>
  apiFetch<Intake>('/intakes', { method: 'POST', body: JSON.stringify(data) })
export const getIntake = (id: number) =>
  apiFetch<IntakeWithItems>(`/intakes/${id}`)
export const updateIntake = (id: number, data: IntakeUpdate) =>
  apiFetch<Intake>(`/intakes/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const addItem = (intakeId: number, data: ItemCreate) =>
  apiFetch<Item>(`/intakes/${intakeId}/items`, { method: 'POST', body: JSON.stringify(data) })
export const printIntakeLabels = (intakeId: number) =>
  apiFetch<{ intake_id: number; printed: number }>(`/intakes/${intakeId}/labels`, { method: 'POST' })
