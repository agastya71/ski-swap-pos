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

/**
 * Permanently delete a user account (e.g. one created in error).
 *
 * Phase G: accounts live in the shared registry; deleting removes the row.
 * Guards (backend-enforced): you cannot delete your own account, and you
 * cannot delete the last active admin. Transaction history is unaffected
 * (sales/items store `created_by` as a username string).
 *
 * @param id - Primary key of the user to delete.
 * @returns The deleted account's id and username.
 * @throws {ApiError} 404 if no user with the given ID exists.
 * @throws {ApiError} 400 if the account is your own or the last active admin.
 */
export const deleteUser = (id: number) =>
  apiFetch<{ deleted: number; username: string }>(`/users/${id}`, {
    method: 'DELETE',
  })

/**
 * Admin resets another user's (or own) password.
 *
 * @param id - Primary key of the user whose password is being reset.
 * @param newPassword - New plaintext password (must meet the complexity policy).
 * @throws {ApiError} 404 if the user is not found in the active event.
 * @throws {ApiError} 422 if the new password fails the complexity policy.
 */
export const resetUserPassword = (id: number, newPassword: string) =>
  apiFetch<{ ok: boolean }>(`/users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  })
