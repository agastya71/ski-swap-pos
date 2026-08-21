/**
 * Authentication API — POST /auth/login.
 * Unlike other api/ modules, login does not use {@link apiFetch} because
 * no Bearer token exists before the user authenticates.
 */
import { getToken } from './client'
import type { TokenResponse } from '../types'

/**
 * Authenticate with the backend and return a JWT access token.
 *
 * @param username - The user's login username.
 * @param password - The user's plaintext password.
 * @returns Token response containing the JWT, role, and active event ID.
 * @throws {Error} If credentials are invalid or the server returns a non-2xx response.
 */
export async function login(username: string, password: string): Promise<TokenResponse> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new Error((data as { detail?: string }).detail ?? 'Login failed')
  }
  return res.json() as Promise<TokenResponse>
}

/**
 * Change the authenticated user's own password.
 *
 * @param oldPassword - The user's current password (re-verified server-side).
 * @param newPassword - The new password (must meet the complexity policy).
 * @throws {Error} 401 if the current password is wrong; 422 if the new password
 * fails the complexity policy or equals the current password.
 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const res = await fetch('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Password change failed' }))
    throw new Error((data as { detail?: string }).detail ?? 'Password change failed')
  }
}

/**
 * Fetch a suggested password that satisfies the complexity policy.
 *
 * Used to prefill a compliant default when creating a user or resetting /
 * changing a password. Available to any authenticated user.
 *
 * @returns A plaintext password that meets the policy.
 * @throws {Error} If the session token is invalid or the server returns non-2xx.
 */
export async function generatePassword(): Promise<string> {
  const res = await fetch('/auth/generate-password', {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Failed to generate password' }))
    throw new Error((data as { detail?: string }).detail ?? 'Failed to generate password')
  }
  return ((await res.json()) as { password: string }).password
}
