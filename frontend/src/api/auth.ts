/**
 * Authentication API — POST /auth/login.
 * Unlike other api/ modules, login does not use {@link apiFetch} because
 * no Bearer token exists before the user authenticates.
 */
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
