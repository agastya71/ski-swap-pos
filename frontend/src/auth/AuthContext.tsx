/**
 * Authentication context — provides the current JWT, decoded token payload,
 * and sign-in/sign-out actions to all components in the React tree.
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { jwtDecode } from 'jwt-decode'
import { setToken, getToken } from '../api/client'
import type { DecodedToken } from '../types'

/** Shape of the value provided by {@link AuthContext}. */
interface AuthContextValue {
  /** Current raw JWT string, or `null` if not signed in. */
  token: string | null
  /** Decoded JWT payload containing role and event_id, or `null` if not signed in. */
  decoded: DecodedToken | null
  /** Store a new JWT and update the decoded payload. */
  signIn: (token: string) => void
  /** Clear the JWT and decoded payload (sign out). */
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Attempt to restore a previously stored JWT from localStorage.
 * Returns the token if valid and not expired; clears and returns null otherwise.
 *
 * @returns The stored valid JWT string, or `null`.
 */
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

/**
 * Provides auth state and auth actions to the entire component tree.
 * On mount, restores any valid JWT that was persisted to localStorage.
 *
 * @param props.children - React subtree that receives auth context.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => tryRestoreToken())
  const [decoded, setDecoded] = useState<DecodedToken | null>(() => {
    const t = tryRestoreToken()
    return t ? jwtDecode<DecodedToken>(t) : null
  })

  /** Persist a new JWT and update both raw and decoded state. */
  function signIn(t: string) {
    setToken(t)
    setTokenState(t)
    setDecoded(jwtDecode<DecodedToken>(t))
  }

  /** Clear the JWT from storage and reset auth state to signed-out. */
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

/**
 * Hook that returns the current {@link AuthContextValue}.
 * Must be called within an {@link AuthProvider} — throws if used outside one.
 *
 * @returns Object with `token`, `decoded`, `signIn`, and `signOut`.
 * @throws {Error} If called outside of an AuthProvider tree.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
