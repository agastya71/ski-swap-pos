import { createContext, useContext, useState, type ReactNode } from 'react'
import { jwtDecode } from 'jwt-decode'
import { setToken, getToken } from '../api/client'
import type { DecodedToken } from '../types'

interface AuthContextValue {
  token: string | null
  decoded: DecodedToken | null
  signIn: (token: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function tryRestoreToken(): string | null {
  const t = getToken()
  if (!t) return null
  try {
    const d = jwtDecode<DecodedToken>(t)
    if (d.exp * 1000 > Date.now()) return t
  } catch { /* malformed token */ }
  setToken(null) // clear expired/invalid token
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => tryRestoreToken())
  const [decoded, setDecoded] = useState<DecodedToken | null>(() => {
    const t = tryRestoreToken()
    return t ? jwtDecode<DecodedToken>(t) : null
  })

  function signIn(t: string) {
    setToken(t)
    setTokenState(t)
    setDecoded(jwtDecode<DecodedToken>(t))
  }

  function signOut() {
    setToken(null)
    setTokenState(null)
    setDecoded(null)
  }

  return (
    <AuthContext.Provider value={{ token, decoded, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
