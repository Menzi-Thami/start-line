import { lazy, Suspense, type ReactNode } from 'react'
import { accountsOff, AuthContext, type AuthConfig } from './auth-context'
import { ScreenRecovery } from './ScreenRecovery'

const AuthProvider = lazy(() => import('./AuthProvider').then((module) => ({ default: module.AuthProvider })))

/** Keep the sign-in SDK out of the initial download when accounts aren't configured. */
export function AppAuth({ config, children }: { config: AuthConfig | null; children: ReactNode }) {
  if (!config) return <AuthContext.Provider value={accountsOff}>{children}</AuthContext.Provider>
  return (
    <ScreenRecovery>
      <Suspense fallback={<div className="page loading-line" role="status">Connecting your account…</div>}>
        <AuthProvider config={config}>{children}</AuthProvider>
      </Suspense>
    </ScreenRecovery>
  )
}
