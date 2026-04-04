import type { TokenResponse } from '../types'

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
