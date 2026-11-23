import { render, screen } from '@testing-library/react'
import { useContext, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppAuth } from './AppAuth'
import { AuthContext, accountsOff, type AuthConfig } from './auth-context'

vi.mock('./AuthProvider', () => ({
  AuthProvider: ({ config, children }: { config: AuthConfig; children: ReactNode }) => {
    const signedOut = config.clientId === 'signed-out'
    const expired = config.clientId === 'expired'
    return <AuthContext.Provider value={{
      ...accountsOff, enabled: true, sessionReady: !signedOut && !expired,
      account: signedOut ? null : { id: 'runner-1', name: 'Alex', email: 'alex@example.test' },
    }}><section aria-label={config.clientId}>{children}</section></AuthContext.Provider>
  },
}))

function AccountState() {
  const auth = useContext(AuthContext)
  return <p>{auth.enabled ? 'Accounts available' : 'Accounts off'}</p>
}

describe('authentication-first app entry', () => {
  it('keeps the app available without sign-in configuration', () => {
    render(<AppAuth config={null}><AccountState /></AppAuth>)
    expect(screen.getByText('Accounts off')).toBeInTheDocument()
  })

  it('does not mount training when signed out', async () => {
    render(<AppAuth config={{ clientId: 'signed-out', authority: 'https://example.test', scope: 'plans', google: false }}><p>Private training</p></AppAuth>)
    expect(await screen.findByRole('heading', { name: 'Your next run starts here.' })).toBeInTheDocument()
    expect(screen.queryByText('Private training')).not.toBeInTheDocument()
  })

  it('does not mount training when the account is remembered but the access token is invalid', async () => {
    render(<AppAuth config={{ clientId: 'expired', authority: 'https://example.test', scope: 'plans', google: false }}><p>Private training</p></AppAuth>)
    expect(await screen.findByRole('heading', { name: 'Continue securely.' })).toBeInTheDocument()
    expect(screen.queryByText('Private training')).not.toBeInTheDocument()
  })

  it('loads the existing provider with a verified session', async () => {
    render(<AppAuth config={{ clientId: 'configured-account', authority: 'https://example.test', scope: 'plans', google: false }}><p>Your running</p></AppAuth>)
    expect(await screen.findByRole('region', { name: 'configured-account' })).toHaveTextContent('Your running')
  })
})
