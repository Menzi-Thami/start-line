import { render, screen } from '@testing-library/react'
import { useContext, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AppAuth } from './AppAuth'
import { AuthContext, type AuthConfig } from './auth-context'

vi.mock('./AuthProvider', () => ({
  AuthProvider: ({ config, children }: { config: AuthConfig; children: ReactNode }) => <section aria-label={config.clientId}>{children}</section>,
}))

function AccountState() {
  const auth = useContext(AuthContext)
  return <p>{auth.enabled ? 'Accounts available' : 'Accounts off'}</p>
}

describe('optional sign-in bundle', () => {
  it('keeps the app available without sign-in configuration', () => {
    render(<AppAuth config={null}><AccountState /></AppAuth>)
    expect(screen.getByText('Accounts off')).toBeInTheDocument()
  })

  it('loads the existing provider with the original configuration', async () => {
    render(<AppAuth config={{ clientId: 'configured-account', authority: 'https://example.test', scope: 'plans' }}><p>Your running</p></AppAuth>)
    expect(await screen.findByRole('region', { name: 'configured-account' })).toHaveTextContent('Your running')
  })
})
