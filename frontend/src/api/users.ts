/**
 * Users API — list, create, and deactivate event user accounts.
 * Requires admin role.
 */
import { apiFetch } from './client'
import type { User, UserCreate } from '../types'

/**
 * Fetch all user accounts for the active event.
 *
 * @returns Array of all User records (active and inactive).
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const getUsers = () => apiFetch<User[]>('/users')

/**
 * Create a new user account for the active event.
 *
 * @param data - Username, plaintext password, and role.
 * @returns The newly created User record.
 * @throws {ApiError} 409 if a user with the same username already exists for this event.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const createUser = (data: UserCreate) =>
  apiFetch<User>('/users', { method: 'POST', body: JSON.stringify(data) })

/**
 * Deactivate a user account, preventing future logins.
 * The record is retained — deactivated users still appear in the admin list with `is_active: false`.
 *
 * @param id - Primary key of the user to deactivate.
 * @returns The updated User record with `is_active: false`.
 * @throws {ApiError} 404 if no user with the given ID exists.
 * @throws {ApiError} 401 if the session token is invalid.
 */
export const deactivateUser = (id: number) =>
  apiFetch<User>(`/users/${id}/deactivate`, { method: 'PATCH' })
