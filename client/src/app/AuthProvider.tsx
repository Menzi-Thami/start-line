import { CacheLookupPolicy, EventType, InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clearSnapshot } from '../lib/home-snapshot'
import { activateCheckInOwner, clearCheckInCopies, pendingDraftCount } from '../features/coaching/check-in-storage'
import { activateRatingOwner, clearRatingDismissals } from '../features/coaching/rating-dismissal'
import { AuthContext, accountsOff, type Auth, type AuthConfig } from './auth-context'
import { describeSignInError, type SignInProblem } from './sign-in-errors'
import { signInRequest, type SignInKind } from './sign-in-requests'

const toAccount = (info: AccountInfo) => ({ id: `${info.tenantId}:${info.localAccountId}`, name: info.name || info.username, email: info.username || null })

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
  !navigator.onLine || /network|timed_out|timeout|request_failed|endpoints_resolution/i.test((failure as { errorCode?: string } | null)?.errorCode ?? '')
const OFFLINE: SignInProblem = { message: 'You’re offline. Reconnect to the internet, then continue securely.', code: null }
// What to tell the runner when a token couldn't be had: offline is not a sign-in fault, and an ended session is what
// the "Continue securely" card already explains, so neither shows as an error.
const tokenProblem = (failure: unknown): SignInProblem | null =>
  isNetworkFailure(failure) ? OFFLINE : failure instanceof InteractionRequiredAuthError ? null : describeSignInError(failure)

// Local data belongs to one runner. Only a known account takes it over: an account MSAL has lost (storage cleared, a
// failed sign-in) must not wipe another runner's unsynced drafts; sign-out and an explicit account switch clear them.
const activateOwner = (account: AccountInfo | null) => {
  if (!account) return
  activateCheckInOwner(toAccount(account).id)
  activateRatingOwner(toAccount(account).id)
}

/**
 * Signs runners in with the External ID tenant. The sign-in is kept in localStorage, so the installed app still knows the
 * runner next time it opens. Only a verified API token opens their training; a device copy never bypasses that gate or the
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
  const [sessionReady, setSessionReady] = useState(false)
  // Guard duplicate redirects per mount, not across PWA reloads, account changes or tests.
  const redirecting = useRef(false)
  // In-flight requests belong to one verified identity. Sign-out, cross-tab changes and unmount invalidate them.
  const sessionVersion = useRef(0)
  const currentAccount = useRef<AccountInfo | null>(null)
  const [error, setError] = useState<SignInProblem | null>(null)

  // Finish any sign-in that just redirected back here, then pick up an existing session.
  useEffect(() => {
    if (!msal) return
    let cancelled = false
    const invalidate = () => { sessionVersion.current++; currentAccount.current = null }
    const eventId = msal.addEventCallback((event) => {
      if (event.eventType !== EventType.ACTIVE_ACCOUNT_CHANGED && event.eventType !== EventType.LOGOUT_SUCCESS) return
      const previous = currentAccount.current
      if (!previous) return
      const active = msal.getActiveAccount()
      const stillCached = msal.getAllAccounts().some(account => account.homeAccountId === previous.homeAccountId)
      if (stillCached && active?.homeAccountId === previous.homeAccountId) return
      // Another tab signed out or changed accounts. Close private UI immediately; do not take over its identity or drafts.
      invalidate()
      setSessionReady(false)
      setInfo(null)
      clearSnapshot()
    })
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
        // A cached MSAL account is NOT proof of a usable session. Never reveal plans or cached
        // workouts until the identity provider supplies an access token for this API.
        let verified = Boolean(result?.accessToken)
        // A successful login redirect can supply an account without an API access token. Likewise,
        // a previous failed prompt=none attempt must not block a later cache-only token recovery.
        // Always try the silent cache/refresh path first; only the interactive quiet redirect is once-per-launch.
        if (account && config && !verified) {
          try {
            const token = await msal.acquireTokenSilent({
              scopes: [config.scope], account, cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken,
            })
            verified = Boolean(token.accessToken)
          } catch (failure) {
            if (!cancelled && msal.getActiveAccount()?.homeAccountId === account.homeAccountId && !result && !quietRenewalTried() && navigator.onLine && !isNetworkFailure(failure)) {
              markQuietRenewal('pending')
              redirecting.current = true
              leaving = true
              await msal.acquireTokenRedirect({ scopes: [config.scope], account, prompt: 'none', redirectStartPage: window.location.href })
              return
            }
            // Straight back from Microsoft, an ended session is a real failure and is shown with its code.
            if (!cancelled) setError(result ? describeSignInError(failure) : tokenProblem(failure))
          }
        }
        if (cancelled) return
        // Cross-tab account changes can happen while startup token acquisition is pending, before our account ref exists.
        if (account && msal.getActiveAccount()?.homeAccountId !== account.homeAccountId) {
          setSessionReady(false)
          setInfo(null)
          return
        }
        activateOwner(account)
        currentAccount.current = account
        setSessionReady(Boolean(account && verified))
        setInfo(account)
      })
      .catch((failure: unknown) => {
        if (cancelled) return
        // A quiet renewal that Microsoft couldn't complete without the runner: they're still the remembered runner, so
        // keep them signed in here and let "Continue securely" ask for the code when it's needed.
        if (quietRenewalPending()) {
          markQuietRenewal('tried')
          redirecting.current = false
          leaving = false
          const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null
          if (account) msal.setActiveAccount(account)
          activateOwner(account)
          currentAccount.current = account
          setError(tokenProblem(failure))
          setSessionReady(false)
          setInfo(account)
          return
        }
        // A sign-in or "Continue securely" that came back failed or cancelled. Training stays closed and the runner is
        // told why. A runner this device still remembers keeps the "Continue securely" card (and their drafts) rather
        // than dropping to the first-visit page as if nobody were here.
        const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null
        if (account) msal.setActiveAccount(account)
        activateOwner(account)
        currentAccount.current = account
        setSessionReady(false)
        setInfo(account)
        setError(describeSignInError(failure))
      })
      .finally(() => {
        if (!cancelled && !leaving) setLoading(false)
      })
    return () => {
      cancelled = true
      invalidate()
      if (eventId) msal.removeEventCallback(eventId)
      redirecting.current = false
    }
  }, [msal, config])

  const value = useMemo<Auth>(() => {
    if (!msal || !config) return accountsOff
    // Come back to exactly this page, so a plan being built isn't lost. The runner picks the account each time: the one
    // this device remembers is forgotten as active (it stays cached, and comes back if they turn round), so its email
    // isn't locked into Microsoft's page.
    const start = (kind: SignInKind) => {
      if (redirecting.current) return
      // Any drafts on the device, not only the remembered runner's: whoever signs in next replaces their owner.
      if (pendingDraftCount() && !window.confirm('You have unsynced run drafts on this device. Choosing a different account removes them. Continue to sign in?')) return
      msal.setActiveAccount(null)
      setError(null)
      redirecting.current = true
      void msal.loginRedirect(signInRequest(kind, config.scope, window.location.href)).catch((failure: unknown) => {
        redirecting.current = false
        setError(describeSignInError(failure))
      })
    }
    return {
      enabled: true,
      loading,
      sessionReady,
      account: info ? toAccount(info) : null,
      error,
      signIn: () => start('sign-in'),
      signUp: () => start('sign-up'),
      signInWithGoogle: config.google ? () => start('google') : undefined,
      resumeSession: () => {
        if (!info || redirecting.current) return
        if (!navigator.onLine) {
          setError(OFFLINE)
          return
        }
        // Keep the same remembered identity and its local run drafts. Unlike signIn, this must not reset
        // the active account or open an account chooser.
        setError(null)
        redirecting.current = true
        // Stays guarded once the page is on its way to Microsoft, so a second tap can't start another interaction.
        void msal.acquireTokenRedirect({
          scopes: [config.scope],
          account: info,
          redirectStartPage: window.location.href,
        }).catch((failure: unknown) => {
          redirecting.current = false
          setError(describeSignInError(failure))
        })
      },
      // Signing out leaves nothing of anyone's on this device: every remembered account (MSAL's logout only removes the one
      // it's given, and an older one would then open as signed in), and the copy of their Home. Then Microsoft ends its session.
      signOut: () => {
        if (redirecting.current) return
        if (pendingDraftCount() && !window.confirm('You have unsynced run drafts on this device. Sign out and discard these drafts?')) return
        redirecting.current = true
        sessionVersion.current++
        currentAccount.current = null
        setSessionReady(false)
        clearSnapshot()
        clearCheckInCopies()
        clearRatingDismissals()
        void (async () => {
          await msal.clearCache().catch(() => undefined)
          // Nothing of the runner's is left here now, so the gate shows the first-visit page, never "Welcome back".
          setInfo(null)
          // Offline, Microsoft's page can't load. This device is signed out regardless, and the next sign-in still offers
          // "use another account" (select_account), so a lingering Microsoft session can't choose the runner for them.
          if (!navigator.onLine) {
            redirecting.current = false
            return
          }
          await msal.logoutRedirect({ account: info ?? undefined }).catch((failure: unknown) => {
            redirecting.current = false
            setError(describeSignInError(failure))
          })
        })()
      },
      getToken: async () => {
        if (!info || currentAccount.current?.homeAccountId !== info.homeAccountId) return null
        const version = sessionVersion.current
        try {
          const token = (await msal.acquireTokenSilent({ scopes: [config.scope], account: info })).accessToken
          if (version !== sessionVersion.current || currentAccount.current?.homeAccountId !== info.homeAccountId) return null
          setSessionReady(Boolean(token))
          return token || null
        } catch (error) {
          if (version !== sessionVersion.current) return null
          // A silent attempt can fail after a PWA has been closed for days, or because Safari blocks
          // identity-provider cookies. Never navigate automatically from a background API call.
          // The account stays remembered; the UI offers a deliberate "Continue securely" action.
          if (error instanceof InteractionRequiredAuthError) {
            setSessionReady(false)
            return null
          }
          throw error
        }
      },
    }
  }, [msal, config, info, loading, sessionReady, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
