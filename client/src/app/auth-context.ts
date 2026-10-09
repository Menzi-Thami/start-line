import { createContext, useContext } from 'react'

export interface Account {
  name: string
  email: string | null
}

export interface Auth {
  /** False when no External ID app is configured: sign-in UI is hidden and the builder works as before. */
  enabled: boolean
  /** True until a returning sign-in redirect has been processed. */
  loading: boolean
  account: Account | null
  signIn: () => void
  /** Like signIn, but opens straight on "create account". */
  signUp: () => void
  signOut: () => void
  /** An access token for the API, or null if the runner isn't signed in. */
  getToken: () => Promise<string | null>
}

export const accountsOff: Auth = {
  enabled: false,
  loading: false,
  account: null,
  signIn: () => undefined,
  signUp: () => undefined,
  signOut: () => undefined,
  getToken: () => Promise.resolve(null),
}

export const AuthContext = createContext<Auth>(accountsOff)

export const useAuth = () => useContext(AuthContext)

export interface AuthConfig {
  clientId: string
  authority: string
  scope: string
}

/** Reads the sign-in settings from client/.env.local. All three must be present or accounts stay off. */
export function readAuthConfig(env: Record<string, string | undefined> = import.meta.env): AuthConfig | null {
  const clientId = env.VITE_AUTH_CLIENT_ID?.trim()
  const authority = env.VITE_AUTH_AUTHORITY?.trim()
  const scope = env.VITE_AUTH_SCOPE?.trim()
  return clientId && authority && scope ? { clientId, authority, scope } : null
}
