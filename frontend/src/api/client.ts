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
   * @param message - Human-readable `detail` from the error response body, or the HTTP status text.
   */
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

interface FastApiValidationError {
  loc?: (string | number)[]
  msg?: string
}

/**
 * Flatten a FastAPI error response `detail` into a human-readable message.
 *
 * FastAPI returns 422 validation errors as detail **arrays** of
 * `{ loc: ["body", "check_number"], msg: "Field required" }` objects. Joining
 * them into one readable line ("Field required (field: check_number)") keeps
 * cashier-facing UI useful instead of showing "[object Object]".
 *
 * @param body - Parsed JSON response body (may be any shape).
 * @returns A human-readable message, or undefined when nothing usable is present.
 */
export function extractApiErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const detail = (body as { detail?: unknown }).detail
  if (detail === null || detail === undefined) return undefined
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts = detail.map(entry => {
      if (entry && typeof entry === 'object') {
        const err = entry as FastApiValidationError
        const field = err.loc?.filter(p => p !== 'body').join('.')
        const msg = err.msg ?? 'validation error'
        return field ? `${msg} (field: ${field})` : msg
      }
      return String(entry)
    })
    return parts.length > 0 ? parts.join('; ') : 'Validation error'
  }
  if (typeof detail === 'object' && 'msg' in (detail as Record<string, unknown>)) {
    return String((detail as FastApiValidationError).msg)
  }
  return undefined
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
    const body: unknown = await res.json().catch(() => null)
    throw new ApiError(res.status, extractApiErrorMessage(body) ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
