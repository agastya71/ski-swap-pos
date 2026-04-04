import { createContext, useContext, useState, type ReactNode } from 'react'
import { jwtDecode } from 'jwt-decode'
import { setToken } from '../api/client'
import type { DecodedToken } from '../types'

interface AuthContextValue {
  token: string | null
  decoded: DecodedToken | null
  signIn: (token: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null)
  const [decoded, setDecoded] = useState<DecodedToken | null>(null)

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
