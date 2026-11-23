import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { accountsOff, AuthContext, type AuthConfig, useAuth } from './auth-context'
import { ConnectingAccount } from './ConnectingAccount'
import { ScreenRecovery } from './ScreenRecovery'
import { SignInLanding } from '../features/home/SignInLanding'
import { Wordmark } from './Wordmark'
import { ThemeToggle } from './ThemeToggle'
import { PrivacyPolicy } from '../features/privacy/Privacy'

const AuthProvider = lazy(() => import('./AuthProvider').then((module) => ({ default: module.AuthProvider })))

/** No training UI may mount until the API access token is valid; cached identity alone is insufficient. */
function SessionGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!auth.loading) { setSlow(false); return }
    const timeout = window.setTimeout(() => setSlow(true), 12_000)
    return () => window.clearTimeout(timeout)
  }, [auth.loading])

  // A privacy policy must stay available to anyone, including before sign-up.
  if (new URLSearchParams(window.location.search).get('view') === 'privacy') {
    return <div className="page"><main id="main-content"><PrivacyPolicy /></main></div>
  }

  if (auth.loading) {
    return <div className="page"><ConnectingAccount />{slow && <section className="empty" role="alert"><p>Sign-in is taking longer than expected.</p><button type="button" className="button" onClick={() => window.location.reload()}>Reload Taperday</button></section>}</div>
  }
  if (auth.sessionReady && auth.account) return <>{children}</>

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

/** Production must fail closed if identity configuration is omitted from a deployment. */
export function AppAuth({ config, children }: { config: AuthConfig | null; children: ReactNode }) {
  if (!config) {
    if (import.meta.env.PROD) return <div className="page"><section className="empty" role="alert"><h1>Sign-in temporarily unavailable</h1><p>Taperday cannot start securely. Please contact support at hello@taperday.run.</p></section></div>
    return <AuthContext.Provider value={accountsOff}>{children}</AuthContext.Provider>
  }
  return <ScreenRecovery><Suspense fallback={<ConnectingAccount />}>
    <AuthProvider config={config}><SessionGate>{children}</SessionGate></AuthProvider>
  </Suspense></ScreenRecovery>
}
