/**
 * Shared API client — in-memory token cache, localStorage persistence,
 * and authenticated fetch wrapper used by all api/ modules.
 */

/** localStorage key under which the JWT is persisted between page loads. */
const TOKEN_KEY = 'auth_token'

/** In-memory token cache. `undefined` = not yet read from storage; `null` = signed out. */
let _token: string | null | undefined = undefined

/**
 * Store a JWT in memory and persist it to localStorage.
 * Pass `null` to clear the token on sign-out.
 *
 * @param t - JWT string to store, or `null` to clear.
 */
export function setToken(t: string | null) {
  _token = t
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* non-browser environment */ }
}

/**
 * Return the current JWT, loading it from localStorage on first call.
 *
 * @returns The stored JWT string, or `null` if no token is present.
 */
export function getToken(): string | null {
  if (_token === undefined) {
    try { _token = localStorage.getItem(TOKEN_KEY) }
    catch { _token = null }
  }
  return _token
}

/**
 * Error thrown by {@link apiFetch} for non-2xx HTTP responses.
 * Inspect {@link ApiError.status} to branch on specific codes —
 * e.g. 401 for session expiry, 404 for missing resources, 409 for conflicts.
 */
export class ApiError extends Error {
  status: number
  /**
   * @param status - HTTP status code returned by the server.
   * @param message - `detail` field from the error response body, or the HTTP status text.
   */
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

/**
 * Authenticated fetch wrapper for all backend API calls.
 * Automatically injects the Bearer token and Content-Type header.
 * Parses the response body as JSON, or returns `undefined` for 204 No Content.
 *
 * @param path - API path relative to the origin, e.g. `/sellers?q=smith`.
 * @param init - Optional fetch init overrides (method, body, additional headers).
 * @returns Parsed JSON response cast to `T`.
 * @throws {ApiError} For any non-2xx HTTP response.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  }
  if (_token) headers['Authorization'] = `Bearer ${_token}`

  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, (body as { detail?: string }).detail ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
