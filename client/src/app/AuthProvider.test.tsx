import { render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth, type AuthConfig } from './auth-context'
import { AuthProvider } from './AuthProvider'
import { readCheckInCopies, writeCheckInCopy } from '../features/coaching/check-in-storage'

type Account = { homeAccountId: string; environment: string; tenantId: string; username: string; localAccountId: string; name: string }
const account = (id: string): Account => ({ homeAccountId: id, environment: 'e', tenantId: 't', username: `${id}@example.com`, localAccountId: id, name: id })
// A runner this phone remembers: the account MSAL would otherwise lock into Microsoft's email box.
const remembered = account('remembered')
const calls: string[] = []
let cached: Account[] = []
let active: Account | null = null
let redirectResult: { account: Account } | null = null
const msal = {
  initialize: vi.fn(() => Promise.resolve()),
  handleRedirectPromise: vi.fn(() => Promise.resolve(redirectResult)),
  getAllAccounts: vi.fn(() => cached),
  getActiveAccount: vi.fn(() => active),
  setActiveAccount: vi.fn((next: Account | null) => { active = next; calls.push(`active:${next?.homeAccountId ?? 'none'}`) }),
  clearCache: vi.fn((request?: { account?: Account }) => {
    cached = request?.account ? cached.filter((a) => a !== request.account) : []
    calls.push(`clear:${request?.account?.homeAccountId ?? 'all'}`)
    return Promise.resolve()
  }),
  logoutRedirect: vi.fn((request?: { account?: Account }) => { calls.push(`logout:${request?.account?.homeAccountId ?? 'none'}`); return Promise.resolve() }),
  loginRedirect: vi.fn((request: { prompt?: string; domainHint?: string }) => {
    calls.push(`redirect:${request.prompt}${request.domainHint ? `:${request.domainHint}` : ''}`)
    return Promise.resolve()
  }),
  acquireTokenSilent: vi.fn(() => Promise.resolve({ accessToken: 'synthetic-token' })),
  acquireTokenRedirect: vi.fn(() => Promise.resolve()),
}

vi.mock('@azure/msal-browser', async (actual) => ({
  ...(await actual<typeof import('@azure/msal-browser')>()),
  PublicClientApplication: vi.fn(function PublicClientApplication() { return msal }),
}))

const config = (google: boolean): AuthConfig => ({
  clientId: 'web',
  authority: 'https://taperday.ciamlogin.com/tenant/',
  scope: 'api://taperday/Plans.ReadWrite',
  google,
})

function Buttons() {
  const auth = useAuth()
  const [token, setToken] = useState<string | null | undefined>(undefined)
  return (
    <>
      <p data-testid="who">{auth.loading ? 'loading' : auth.account?.email ?? 'signed out'}</p>
      <button type="button" onClick={auth.signIn}>sign in</button>
      <button type="button" onClick={auth.signUp}>sign up</button>
      <button type="button" onClick={auth.signOut}>sign out</button>
      <button type="button" onClick={() => void auth.getToken().then(setToken)}>read token</button>
      {token !== undefined && <output>{token ?? 'no token'}</output>}
      {auth.signInWithGoogle && <button type="button" onClick={auth.signInWithGoogle}>google</button>}
    </>
  )
}

const renderWith = async (google: boolean) => {
  render(<AuthProvider config={config(google)}><Buttons /></AuthProvider>)
  await waitFor(() => expect(screen.getByTestId('who')).not.toHaveTextContent('loading'))
  calls.length = 0
}

beforeEach(() => {
  calls.length = 0
  vi.clearAllMocks()
  cached = [remembered]
  active = null
  redirectResult = null
})

describe('starting a sign-in on a device that remembers someone', () => {
  it('forgets the remembered account first, so the runner can type any email', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    await user.click(screen.getByRole('button', { name: 'sign in' }))
    await user.click(screen.getByRole('button', { name: 'sign up' }))
    expect(calls).toEqual(['active:none', 'redirect:select_account', 'active:none', 'redirect:create'])
  })

  it('hides Google until it is switched on', async () => {
    await renderWith(false)
    expect(screen.queryByRole('button', { name: 'google' })).not.toBeInTheDocument()
  })

  it('sends a Google sign-in straight to Google with the hint the tenant accepts', async () => {
    const user = userEvent.setup()
    await renderWith(true)
    await user.click(screen.getByRole('button', { name: 'google' }))
    expect(calls).toEqual(['active:none', 'redirect:select_account:google.com'])
  })
})

describe('one runner per device', () => {
  it('keeps unsynced drafts in place when an online token renewal needs explicit sign-in', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    writeCheckInCopy('t:remembered', 'plan', { entries: [], pending: [{ revision: 'one', key: '2026-10-14|Easy',
      date: '2026-10-14', sessionType: 'Easy', base: null, answers: { status: 'Done', effort: null, distanceUnreported: false } }] })
    msal.acquireTokenSilent.mockRejectedValueOnce(new InteractionRequiredAuthError('login_required', 'Synthetic token renewal required'))
    await user.click(screen.getByRole('button', { name: 'read token' }))
    expect(await screen.findByText('no token')).toBeInTheDocument()
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
    expect(readCheckInCopies('t:remembered').plan?.pending).toHaveLength(1)
  })
  it('does not redirect a runner away from offline drafts when their token needs interactive renewal', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    const connection = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    msal.acquireTokenSilent.mockRejectedValueOnce(new InteractionRequiredAuthError('login_required', 'Synthetic token renewal required'))
    try {
      await user.click(screen.getByRole('button', { name: 'read token' }))
      expect(await screen.findByText('no token')).toBeInTheDocument()
      expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
    } finally { connection.mockRestore() }
  })
  it('keeps unsynced drafts when sign-out is cancelled and clears them only after explicit discard', async () => {
    const user = userEvent.setup()
    active = remembered
    await renderWith(false)
    writeCheckInCopy('t:remembered', 'plan', { entries: [], pending: [{ revision: 'one', key: '2026-10-14|Easy',
      date: '2026-10-14', sessionType: 'Easy', base: null, answers: { status: 'Done', effort: null, distanceUnreported: false } }] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    expect(calls).toEqual([])
    expect(readCheckInCopies('t:remembered').plan?.pending).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(calls).toEqual(['clear:all', 'logout:remembered']))
    expect(readCheckInCopies('t:remembered')).toEqual({})
    expect(confirm).toHaveBeenCalledTimes(2)
    confirm.mockRestore()
  })
  it('signing out forgets every remembered account, not just the one signed in, then ends the Microsoft session', async () => {
    const user = userEvent.setup()
    const older = account('older')
    cached = [older, remembered]
    active = remembered
    await renderWith(false)
    expect(screen.getByTestId('who')).toHaveTextContent('remembered@example.com')
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(calls).toEqual(['clear:all', 'logout:remembered']))
    expect(cached).toEqual([])
  })

  it('opens on the account last signed in with, not whichever the device listed first', async () => {
    cached = [account('older'), remembered]
    active = remembered
    await renderWith(false)
    expect(screen.getByTestId('who')).toHaveTextContent('remembered@example.com')
  })

  it('a completed sign-in replaces any other account the device remembered', async () => {
    const fresh = account('fresh')
    cached = [remembered, fresh]
    redirectResult = { account: fresh }
    await renderWith(false)
    expect(screen.getByTestId('who')).toHaveTextContent('fresh@example.com')
    expect(cached).toEqual([fresh])
  })
})
