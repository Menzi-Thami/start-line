import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, accountsOff, type Auth, type AuthConfig } from './auth-context'
import { describeSignInError, type SignInProblem } from './sign-in-errors'

const toAccount = (info: AccountInfo) => ({ name: info.name || info.username, email: info.username || null })

/**
 * Signs runners in with the External ID tenant. Tokens are cached in sessionStorage (never localStorage,
 * which any injected script could read) and requested per call, so they're always fresh.
 */
export function AuthProvider({ config, children }: { config: AuthConfig | null; children: ReactNode }) {
  const msal = useMemo(
    () =>
      config
        ? new PublicClientApplication({
            auth: {
              clientId: config.clientId,
              authority: config.authority,
              knownAuthorities: [new URL(config.authority).host],
              redirectUri: window.location.origin,
              postLogoutRedirectUri: window.location.origin,
            },
            cache: { cacheLocation: 'sessionStorage' },
          })
        : null,
    [config],
  )
  const [info, setInfo] = useState<AccountInfo | null>(null)
  const [loading, setLoading] = useState(msal !== null)
  const [error, setError] = useState<SignInProblem | null>(null)

  // Finish any sign-in that just redirected back here, then pick up an existing session.
  useEffect(() => {
    if (!msal) return
    let cancelled = false
    msal
      .initialize()
      .then(() => msal.handleRedirectPromise())
      .then((result) => {
        if (cancelled) return
        const account = result?.account ?? msal.getAllAccounts()[0] ?? null
        if (account) msal.setActiveAccount(account)
        setInfo(account)
      })
      .catch((failure: unknown) => {
        // The runner stays signed out, but is told why rather than left guessing.
        if (!cancelled) setError(describeSignInError(failure))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [msal])

  const value = useMemo<Auth>(() => {
    if (!msal || !config) return accountsOff
    return {
      enabled: true,
      loading,
      account: info ? toAccount(info) : null,
      error,
      // Come back to exactly this page, so a plan being built isn't lost.
      signIn: () => void msal.loginRedirect({ scopes: [config.scope], redirectStartPage: window.location.href }),
      signUp: () => void msal.loginRedirect({ scopes: [config.scope], prompt: 'create', redirectStartPage: window.location.href }),
      signOut: () => void msal.logoutRedirect({ account: info ?? undefined }),
      getToken: async () => {
        if (!info) return null
        try {
          return (await msal.acquireTokenSilent({ scopes: [config.scope], account: info })).accessToken
        } catch (error) {
          if (error instanceof InteractionRequiredAuthError) {
            await msal.acquireTokenRedirect({ scopes: [config.scope], account: info, redirectStartPage: window.location.href })
          }
          return null
        }
      },
    }
  }, [msal, config, info, loading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
