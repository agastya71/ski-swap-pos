const TOKEN_KEY = 'auth_token'
let _token: string | null | undefined = undefined // undefined = not yet read from storage

export function setToken(t: string | null) {
  _token = t
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* non-browser environment */ }
}

export function getToken(): string | null {
  if (_token === undefined) {
    try { _token = localStorage.getItem(TOKEN_KEY) }
    catch { _token = null }
  }
  return _token
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

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
