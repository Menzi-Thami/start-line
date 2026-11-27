import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { accountsOff, AuthContext, type AuthConfig, useAuth } from './auth-context'
import { ConnectingAccount } from './ConnectingAccount'
import { ScreenRecovery } from './ScreenRecovery'
import { SignInLanding } from '../features/home/SignInLanding'
import { Wordmark } from './Wordmark'
import { ThemeToggle } from './ThemeToggle'
import { PrivacyPolicy } from '../features/privacy/Privacy'
import { Unsubscribe } from '../features/account/Unsubscribe'

const AuthProvider = lazy(() => import('./AuthProvider').then((module) => ({ default: module.AuthProvider })))

/** No training UI may mount until the API access token is valid; cached identity alone is insufficient. */
export function SessionGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!auth.loading) return
    const timeout = window.setTimeout(() => setSlow(true), 12_000)
    return () => window.clearTimeout(timeout)
  }, [auth.loading])

  // A privacy policy must stay available to anyone, including before sign-up.
  const publicRoute = new URLSearchParams(window.location.search)
  if (publicRoute.get('view') === 'privacy') {
    return <div className="page"><main id="main-content"><PrivacyPolicy /></main></div>
  }
  // Email unsubscribe links must work without sign-in.
  if (publicRoute.get('view') === 'unsubscribe') {
    return <div className="page"><main id="main-content">
      <Unsubscribe token={publicRoute.get('t')} weekly={publicRoute.get('list') === 'weekly'} onOpenAccount={() => window.location.assign('/?view=sign-in')} />
    </main></div>
  }

  if (auth.loading) {
    return <div className="page"><ConnectingAccount />{slow && <section className="empty" role="alert"><p>Sign-in is taking longer than expected.</p><button type="button" className="button" onClick={() => window.location.reload()}>Reload Taperday</button></section>}</div>
  }
  if (auth.sessionReady && auth.account) return <>{children}</>
  if (setPasswordLink(publicRoute)) return <SetPasswordStart onStart={auth.signIn} />

  return <div className="page">
    <header className="masthead"><span className="wordmark"><Wordmark /></span></header>
    <ThemeToggle />
    <main id="main-content">
      {auth.error && <div className="callout" role="alert"><p>{auth.error.message}{auth.error.code ? ` (Code: ${auth.error.code})` : ''}</p></div>}
      {auth.account ? <section className="sign-in-landing" aria-labelledby="session-expired-title"><div className="sign-in-landing-card">
        <p className="sign-in-eyebrow">Welcome back</p>
        <h1 id="session-expired-title">Continue securely.</h1>
        <p className="sign-in-lede">Your account is remembered, but your session needs renewing before training can open.</p>
        <button type="button" className="button button-primary" onClick={auth.resumeSession ?? auth.signIn}>Continue securely</button>
        <button type="button" className="button button-quiet" onClick={auth.signOut}>Use another account</button>
      </div></section>
      : <SignInLanding onSignIn={auth.signIn} onSignUp={auth.signUp} onGoogle={auth.signInWithGoogle} />}
    </main>
  </div>
}

/** The "Set my password" link in emails (`/?view=set-password`). */
export const setPasswordLink = (params: URLSearchParams) => params.get('view') === 'set-password'

/**
 * Microsoft has no direct password-reset address for External ID: reset is the "Forgot password?" link on its sign-in
 * page. So the email's link goes straight to that page instead of Taperday's welcome screen. The address becomes Home
 * first, so coming back (signed in, or by pressing Back on Microsoft's page) never starts the redirect again.
 */
function SetPasswordStart({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    window.history.replaceState(window.history.state, '', '/?view=home')
    onStart()
  }, [onStart])
  return <div className="page">
    <header className="masthead"><span className="wordmark"><Wordmark /></span></header>
    <main id="main-content">
      <section className="sign-in-landing" aria-labelledby="set-password-title"><div className="sign-in-landing-card">
        <h1 id="set-password-title">Set your password</h1>
        <p className="sign-in-lede">Taking you to the sign-in page. Enter your email, tap <strong>Next</strong>, then <strong>Forgot password?</strong></p>
        <button type="button" className="button button-primary" onClick={onStart}>Go to sign-in</button>
      </div></section>
    </main>
  </div>
}

/** Production must fail closed if identity configuration is omitted from a deployment. */
export function AppAuth({ config, children }: { config: AuthConfig | null; children: ReactNode }) {
  if (!config) {
    // Only the explicit CI test bundle may run the legacy synthetic anonymous E2E journeys.
    // The deployed production bundle always uses MODE=production and fails closed.
    if (import.meta.env.PROD && import.meta.env.MODE !== 'e2e') return <div className="page"><section className="empty" role="alert"><h1>Sign-in temporarily unavailable</h1><p>Taperday cannot start securely. Please contact support at hello@taperday.run.</p></section></div>
    return <AuthContext.Provider value={accountsOff}>{children}</AuthContext.Provider>
  }
  return <ScreenRecovery><Suspense fallback={<ConnectingAccount />}>
    <AuthProvider config={config}><SessionGate>{children}</SessionGate></AuthProvider>
  </Suspense></ScreenRecovery>
}
