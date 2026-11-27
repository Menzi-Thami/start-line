import { render, screen } from '@testing-library/react'
import { useContext, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppAuth } from './AppAuth'
import { AuthContext, accountsOff, type AuthConfig } from './auth-context'

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }))

vi.mock('./AuthProvider', () => ({
  AuthProvider: ({ config, children }: { config: AuthConfig; children: ReactNode }) => {
    const signedOut = config.clientId === 'signed-out'
    const expired = config.clientId === 'expired'
    return <AuthContext.Provider value={{
      ...accountsOff, enabled: true, sessionReady: !signedOut && !expired, signIn,
      account: signedOut ? null : { id: 'runner-1', name: 'Alex', email: 'alex@example.test' },
    }}><section aria-label={config.clientId}>{children}</section></AuthContext.Provider>
  },
}))

function AccountState() {
  const auth = useContext(AuthContext)
  return <p>{auth.enabled ? 'Accounts available' : 'Accounts off'}</p>
}

afterEach(() => {
  vi.unstubAllEnvs()
  signIn.mockClear()
  window.history.replaceState(null, '', '/')
})

describe('authentication-first app entry', () => {
  it('keeps the app available without sign-in configuration', () => {
    render(<AppAuth config={null}><AccountState /></AppAuth>)
    expect(screen.getByText('Accounts off')).toBeInTheDocument()
  })

  it('fails closed in the deployed production bundle when identity configuration is missing', () => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('MODE', 'production')
    render(<AppAuth config={null}><p>Private training</p></AppAuth>)
    expect(screen.getByRole('heading', { name: 'Sign-in temporarily unavailable' })).toBeInTheDocument()
    expect(screen.queryByText('Private training')).not.toBeInTheDocument()
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

  it('sends the email's set-password link straight to Microsoft's sign-in, once, and leaves Home in the address bar', async () => {
    window.history.replaceState(null, '', '/?view=set-password')
    render(<AppAuth config={{ clientId: 'signed-out', authority: 'https://example.test', scope: 'plans', google: false }}><p>Private training</p></AppAuth>)
    expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument()
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?view=home')
    expect(screen.queryByText('Private training')).not.toBeInTheDocument()
  })

  it('opens the app as usual when the set-password link is used while already signed in', async () => {
    window.history.replaceState(null, '', '/?view=set-password')
    render(<AppAuth config={{ clientId: 'configured-account', authority: 'https://example.test', scope: 'plans', google: false }}><p>Your running</p></AppAuth>)
    expect(await screen.findByText('Your running')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })
})
