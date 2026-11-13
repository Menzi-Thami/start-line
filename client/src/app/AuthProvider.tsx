import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSnapshot } from '../lib/home-snapshot'
import { AuthContext, accountsOff, type Auth, type AuthConfig } from './auth-context'
import { describeSignInError, type SignInProblem } from './sign-in-errors'
import { signInRequest, type SignInKind } from './sign-in-requests'

const toAccount = (info: AccountInfo) => ({ name: info.name || info.username, email: info.username || null })

// Several parts of a page can ask for a token at once. Only the first may start the sign-in redirect: a second one
// would fail with interaction_in_progress and its raw text would reach the runner.
let redirecting = false

/**
 * Signs runners in with the External ID tenant. The sign-in is kept in localStorage, so the installed app still knows the
 * runner next time it opens and goes straight to their plan from the device's copy, with no sign-in and no wait for the
 * database. MSAL keeps it past closing the app only for a runner who said yes to "Stay signed in?" (External ID asks by
 * default); otherwise it's encrypted with a key held in a session cookie and is gone once the browser closes, as before.
 * Either way signing out clears it. Tokens are requested per call, so they're always fresh. Storage an injected script
 * could read is a risk either way; the strict Content-Security-Policy (no inline or outside scripts) is the defence.
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
            cache: { cacheLocation: 'localStorage' },
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
      .then(async (result) => {
        if (cancelled) return
        // One runner per device. Whoever just signed in replaces anyone this device remembered, so signing out later can't
        // reveal an older account; otherwise it's the account last signed in with (MSAL keeps it as the active one).
        if (result?.account) {
          const others = msal.getAllAccounts().filter((a) => a.homeAccountId !== result.account.homeAccountId)
          await Promise.all(others.map((account) => msal.clearCache({ account }).catch(() => undefined)))
        }
        if (cancelled) return
        const account = result?.account ?? msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null
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
    // Come back to exactly this page, so a plan being built isn't lost. The runner picks the account each time: the one
    // this device remembers is forgotten as active (it stays cached, and comes back if they turn round), so its email
    // isn't locked into Microsoft's page.
    const start = (kind: SignInKind) => {
      msal.setActiveAccount(null)
      void msal.loginRedirect(signInRequest(kind, config.scope, window.location.href))
    }
    return {
      enabled: true,
      loading,
      account: info ? toAccount(info) : null,
      error,
      signIn: () => start('sign-in'),
      signUp: () => start('sign-up'),
      signInWithGoogle: config.google ? () => start('google') : undefined,
      // Signing out leaves nothing of anyone's on this device: every remembered account (MSAL's logout only removes the one
      // it's given, and an older one would then open as signed in), and the copy of their Home. Then Microsoft ends its session.
      signOut: () => {
        clearSnapshot()
        void (async () => {
          await msal.clearCache().catch(() => undefined)
          await msal.logoutRedirect({ account: info ?? undefined })
        })()
      },
      getToken: async () => {
        if (!info) return null
        try {
          return (await msal.acquireTokenSilent({ scopes: [config.scope], account: info })).accessToken
        } catch (error) {
          if (error instanceof InteractionRequiredAuthError && !redirecting) {
            redirecting = true
            // The page is about to leave for Microsoft; nothing useful can be done with a failure to start that here.
            await msal
              .acquireTokenRedirect({ scopes: [config.scope], account: info, redirectStartPage: window.location.href })
              .catch(() => {
                redirecting = false
              })
          }
          return null
        }
      },
    }
  }, [msal, config, info, loading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
