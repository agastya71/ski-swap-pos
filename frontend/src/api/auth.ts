import type { TokenResponse } from '../types'

export async function login(username: string, password: string): Promise<TokenResponse> {
  const body = new URLSearchParams({ username, password, grant_type: 'password' })
  const res = await fetch('/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new Error((data as { detail?: string }).detail ?? 'Login failed')
  }
  return res.json() as Promise<TokenResponse>
}
