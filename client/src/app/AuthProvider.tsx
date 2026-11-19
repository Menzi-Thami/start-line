import { CacheLookupPolicy, InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearSnapshot } from '../lib/home-snapshot'
import { activateCheckInOwner, clearCheckInCopies, readCheckInCopies } from '../features/coaching/check-in-storage'
import { AuthContext, accountsOff, type Auth, type AuthConfig } from './auth-context'
import { describeSignInError, type SignInProblem } from './sign-in-errors'
import { signInRequest, type SignInKind } from './sign-in-requests'

const toAccount = (info: AccountInfo) => ({ id: `${info.tenantId}:${info.localAccountId}`, name: info.name || info.username, email: info.username || null })

// Interactive renewal is user initiated; guard repeat taps until the redirect completes.
let redirecting = false

// Marks a quiet renewal (prompt=none) for this app launch, so a failed one is never retried in a loop. sessionStorage
// survives the round trip to Microsoft in the same tab, and is fresh again the next time the app opens.
const QUIET_RENEWAL = 'taperday.quiet-renewal'
const quietRenewalTried = () => {
  try { return sessionStorage.getItem(QUIET_RENEWAL) !== null } catch { return true }
}
const markQuietRenewal = (state: 'pending' | 'tried') => {
  try { sessionStorage.setItem(QUIET_RENEWAL, state) } catch { /* private mode: just don't renew quietly */ }
}
const quietRenewalPending = () => {
  try { return sessionStorage.getItem(QUIET_RENEWAL) === 'pending' } catch { return false }
}
const isNetworkFailure = (failure: unknown) =>
  !navigator.onLine || /network|timed_out|timeout/i.test((failure as { errorCode?: string } | null)?.errorCode ?? '')

/**
 * Signs runners in with the External ID tenant. The sign-in is kept in localStorage, so the installed app still knows the
 * runner next time it opens and goes straight to their plan from the device's copy, with no sign-in and no wait for the
 * database. MSAL keeps it past closing the app only for a runner who said yes to "Stay signed in?" (External ID asks by
 * default); otherwise it's encrypted with a key held in a session cookie and is gone once the browser closes, as before.
 * Either way signing out clears it. Tokens are requested per call and silently renewed where possible. When the app opens
 * after its 24-hour sign-in has run out, it renews once with a quiet visit to Microsoft that shows no page. Otherwise,
 * when Microsoft's session needs interaction, the runner chooses when to continue; never redirect out of an unsynced workout.
 * Storage an injected script could read is a risk; the strict Content-Security-Policy limits that exposure.
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
    // True while the page is on its way to Microsoft for a quiet renewal: stay loading rather than flash signed out.
    let leaving = false
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
        if (quietRenewalPending()) markQuietRenewal('tried')
        const account = result?.account ?? msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null
        if (account) msal.setActiveAccount(account)
        // Microsoft gives this app a sign-in that lasts 24 hours. When the app opens after that, renew it before the
        // runner starts anything: a top-level visit with prompt=none, which never shows a page. With Microsoft's session
        // still alive ("Stay signed in?" answered Yes) it's just a reload and they stay signed in; otherwise it comes
        // straight back and "Continue securely" is offered as before. Once per launch, never mid-task, never offline.
        if (account && !result && config && !quietRenewalTried() && navigator.onLine) {
          try {
            await msal.acquireTokenSilent({ scopes: [config.scope], account, cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken })
          } catch (failure) {
            if (!cancelled && !isNetworkFailure(failure)) {
              markQuietRenewal('pending')
              redirecting = true
              leaving = true
              await msal.acquireTokenRedirect({ scopes: [config.scope], account, prompt: 'none', redirectStartPage: window.location.href })
              return
            }
          }
        }
        if (cancelled) return
        activateCheckInOwner(account ? toAccount(account).id : null)
        setInfo(account)
      })
      .catch((failure: unknown) => {
        if (cancelled) return
        // A quiet renewal that Microsoft couldn't complete without the runner: they're still the remembered runner, so
        // keep them signed in here and let "Continue securely" ask for the code when it's needed.
        if (quietRenewalPending()) {
          markQuietRenewal('tried')
          redirecting = false
          leaving = false
          const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null
          if (account) msal.setActiveAccount(account)
          activateCheckInOwner(account ? toAccount(account).id : null)
          setInfo(account)
          return
        }
        // The runner stays signed out, but is told why rather than left guessing.
        setError(describeSignInError(failure))
      })
      .finally(() => {
        if (!cancelled && !leaving) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [msal, config])

  const value = useMemo<Auth>(() => {
    if (!msal || !config) return accountsOff
    // Come back to exactly this page, so a plan being built isn't lost. The runner picks the account each time: the one
    // this device remembers is forgotten as active (it stays cached, and comes back if they turn round), so its email
    // isn't locked into Microsoft's page.
    const start = (kind: SignInKind) => {
      const drafts = Object.values(readCheckInCopies(info ? toAccount(info).id : null)).reduce((sum, copy) => sum + copy.pending.length, 0)
      if (drafts && !window.confirm('You have unsynced run drafts on this device. Choosing a different account removes them. Continue to sign in?')) return
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
      resumeSession: () => {
        if (!info || redirecting) return
        if (!navigator.onLine) {
          setError({ message: 'You’re offline. Reconnect to the internet, then continue securely.', code: null })
          return
        }
        // Keep the same remembered identity and its local run drafts. Unlike signIn, this must not reset
        // the active account or open an account chooser.
        redirecting = true
        void msal.acquireTokenRedirect({
          scopes: [config.scope],
          account: info,
          redirectStartPage: window.location.href,
        }).catch((failure: unknown) => {
          setError(describeSignInError(failure))
        }).finally(() => {
          redirecting = false
        })
      },
      // Signing out leaves nothing of anyone's on this device: every remembered account (MSAL's logout only removes the one
      // it's given, and an older one would then open as signed in), and the copy of their Home. Then Microsoft ends its session.
      signOut: () => {
        const drafts = Object.values(readCheckInCopies(info ? toAccount(info).id : null)).reduce((sum, copy) => sum + copy.pending.length, 0)
        if (drafts && !window.confirm('You have unsynced run drafts on this device. Sign out and discard these drafts?')) return
        clearSnapshot()
        clearCheckInCopies()
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
          // A silent attempt can fail after a PWA has been closed for days, or because Safari blocks
          // identity-provider cookies. Never navigate automatically from a background API call.
          // The account stays remembered; the UI offers a deliberate "Continue securely" action.
          if (error instanceof InteractionRequiredAuthError) return null
          throw error
        }
      },
    }
  }, [msal, config, info, loading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
