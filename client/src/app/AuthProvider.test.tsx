import { act, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { AuthError, EventType, InteractionRequiredAuthError, ServerError, type EventMessage } from '@azure/msal-browser'
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
let redirectResult: { account: Account; accessToken?: string } | null = null
let accountEvent: ((event: EventMessage) => void) | null = null
const msal = {
  addEventCallback: vi.fn((callback: (event: EventMessage) => void) => { accountEvent = callback; return 'listener' }),
  removeEventCallback: vi.fn(),
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
      <p data-testid="verified">{auth.sessionReady ? 'verified' : 'needs sign-in'}</p>
      <p data-testid="error">{auth.error ? `${auth.error.message}|${auth.error.code ?? ''}` : 'no error'}</p>
      <button type="button" onClick={auth.signIn}>sign in</button>
      <button type="button" onClick={auth.signUp}>sign up</button>
      <button type="button" onClick={auth.signOut}>sign out</button>
      <button type="button" onClick={() => void auth.getToken().then(setToken)}>read token</button>
      {auth.resumeSession && <button type="button" onClick={auth.resumeSession}>continue securely</button>}
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
  sessionStorage.clear()
  localStorage.clear()
})

describe('opening the app after its 24-hour sign-in has run out', () => {
  const open = () => render(<AuthProvider config={config(false)}><Buttons /></AuthProvider>)
  const expired = () => new InteractionRequiredAuthError('no_tokens_found', 'Synthetic expired refresh token')

  it('uses the stored tokens only, and needs no renewal while they are valid', async () => {
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ account: remembered, cacheLookupPolicy: 2 }))
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('renews with a quiet visit to Microsoft that shows no page, staying on this page and this account', async () => {
    msal.acquireTokenSilent.mockRejectedValueOnce(expired())
    open()
    await waitFor(() => expect(msal.acquireTokenRedirect).toHaveBeenCalledWith({
      scopes: [config(false).scope], account: remembered, prompt: 'none', redirectStartPage: window.location.href,
    }))
    // On its way out: no flash of a signed-out page.
    expect(screen.getByTestId('who')).toHaveTextContent('loading')
    expect(msal.clearCache).not.toHaveBeenCalled()
  })

  it('keeps the remembered runner when Microsoft needs a code after all, and offers Continue securely', async () => {
    sessionStorage.setItem('taperday.quiet-renewal', 'pending')
    msal.handleRedirectPromise.mockRejectedValueOnce(new InteractionRequiredAuthError('login_required', 'Synthetic: session ended'))
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'continue securely' })).toBeInTheDocument()
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('taperday.quiet-renewal')).toBe('tried')
  })

  it('never repeats the quiet redirect, but still checks the token cache on every launch', async () => {
    sessionStorage.setItem('taperday.quiet-renewal', 'tried')
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(msal.acquireTokenSilent).toHaveBeenCalledOnce()
    expect(screen.getByTestId('verified')).toHaveTextContent('verified')
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('stays put offline, with the runner still remembered', async () => {
    const connection = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      open()
      expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
      expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
    } finally { connection.mockRestore() }
  })

  it('verifies a usable API token after a successful redirect that returned an account only', async () => {
    redirectResult = { account: remembered }
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith(expect.objectContaining({ account: remembered }))
    expect(screen.getByTestId('verified')).toHaveTextContent('verified')
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('does not expose a private session after a redirect with no usable API token', async () => {
    redirectResult = { account: remembered }
    msal.acquireTokenSilent.mockRejectedValueOnce(expired())
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
    // Do not trigger a second automatic redirect while processing a redirect result.
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('retries cached token recovery after a previous quiet renewal failed without looping redirects', async () => {
    sessionStorage.setItem('taperday.quiet-renewal', 'tried')
    msal.acquireTokenSilent.mockRejectedValueOnce(expired())
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })
})

describe('starting a sign-in on a device that remembers someone', () => {
  it('forgets the active account and prevents a duplicate redirect while choosing an identity', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    await user.click(screen.getByRole('button', { name: 'sign in' }))
    await user.click(screen.getByRole('button', { name: 'sign up' }))
    expect(calls).toEqual(['active:none', 'redirect:select_account'])
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

  it('never redirects during a silent token failure, then renews only on a user tap', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    msal.acquireTokenSilent.mockRejectedValueOnce(new InteractionRequiredAuthError('login_required', 'Synthetic session expiry'))
    await user.click(screen.getByRole('button', { name: 'read token' }))
    expect(await screen.findByText('no token')).toBeInTheDocument()
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
    expect(cached).toEqual([remembered])

    await user.click(screen.getByRole('button', { name: 'continue securely' }))
    await waitFor(() => expect(msal.acquireTokenRedirect).toHaveBeenCalledWith({
      scopes: [config(false).scope], account: remembered, redirectStartPage: window.location.href,
    }))
    expect(msal.clearCache).not.toHaveBeenCalled()
    expect(cached).toEqual([remembered])
  })

  it('keeps queued offline runs when a runner explicitly renews the same account', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    writeCheckInCopy('t:remembered', 'plan', { entries: [], pending: [{ revision: 'one', key: '2026-10-14|Easy',
      date: '2026-10-14', sessionType: 'Easy', base: null, answers: { status: 'Done', effort: null, distanceUnreported: false } }] })

    await user.click(screen.getByRole('button', { name: 'continue securely' }))
    await waitFor(() => expect(msal.acquireTokenRedirect).toHaveBeenCalledTimes(1))
    expect(readCheckInCopies('t:remembered').plan?.pending).toHaveLength(1)
    expect(msal.clearCache).not.toHaveBeenCalled()
    expect(msal.getActiveAccount()).toEqual(remembered)
  })

  it('does not attempt interactive renewal without internet', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    const connection = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      await user.click(screen.getByRole('button', { name: 'continue securely' }))
      expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
      expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
      expect(cached).toEqual([remembered])
    } finally { connection.mockRestore() }
  })
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

// Regression cases from the 24 Nov 2026 Entra/PWA review (docs/qa/2026-11-24/entra-pwa-acceptance.md).
const draft = (owner: string) => writeCheckInCopy(owner, 'plan', { entries: [], pending: [{ revision: 'one', key: '2026-10-14|Easy',
  date: '2026-10-14', sessionType: 'Easy', base: null, answers: { status: 'Done', effort: null, distanceUnreported: false } }] })
const open = () => render(<AuthProvider config={config(false)}><Buttons /></AuthProvider>)

describe('session verification edge cases', () => {
  it('opens straight away when the redirect itself carried an API token', async () => {
    redirectResult = { account: remembered, accessToken: 'synthetic-token' }
    open()
    await waitFor(() => expect(screen.getByTestId('verified')).toHaveTextContent('verified'))
    expect(msal.acquireTokenSilent).not.toHaveBeenCalled()
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('an ended session on launch shows the Continue securely card, not a sign-in error', async () => {
    sessionStorage.setItem('taperday.quiet-renewal', 'tried')
    msal.acquireTokenSilent.mockRejectedValueOnce(new InteractionRequiredAuthError('login_required', 'Synthetic session ended'))
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
    expect(screen.getByTestId('error')).toHaveTextContent('no error')
  })

  it('a network failure on launch says offline, stays closed and never redirects', async () => {
    msal.acquireTokenSilent.mockRejectedValueOnce(new AuthError('no_network_connectivity', 'Synthetic network failure'))
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
    expect(screen.getByTestId('error')).toHaveTextContent('You’re offline')
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('a quiet renewal that cannot start still ends loading on the Continue securely card', async () => {
    msal.acquireTokenSilent.mockRejectedValueOnce(new InteractionRequiredAuthError('no_tokens_found', 'Synthetic expired'))
    msal.acquireTokenRedirect.mockRejectedValueOnce(new AuthError('interaction_in_progress', 'Synthetic'))
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
    expect(screen.getByRole('button', { name: 'continue securely' })).toBeInTheDocument()
    expect(sessionStorage.getItem('taperday.quiet-renewal')).toBe('tried')
  })
})

describe('failed or cancelled returns from Microsoft', () => {
  it('a cancelled Continue securely keeps the remembered runner, their drafts and the way back in', async () => {
    draft('t:remembered')
    active = remembered
    msal.handleRedirectPromise.mockRejectedValueOnce(new AuthError('user_cancelled', 'Synthetic cancel'))
    open()
    expect(await screen.findByText('remembered@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
    expect(screen.getByTestId('error')).toHaveTextContent('Sign-in was cancelled')
    expect(screen.getByRole('button', { name: 'continue securely' })).toBeInTheDocument()
    expect(readCheckInCopies('t:remembered').plan?.pending).toHaveLength(1)
  })

  it('a failed first sign-in with nobody remembered stays on the signed-out page with the code', async () => {
    cached = []
    msal.handleRedirectPromise.mockRejectedValueOnce(new ServerError('invalid_request', 'corr-1', 'AADSTS50011: Synthetic redirect mismatch. Trace ID: 1'))
    open()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('signed out'))
    expect(screen.getByTestId('error')).toHaveTextContent('AADSTS50011')
    expect(screen.getByTestId('error')).toHaveTextContent('set up correctly')
  })
})

describe('account isolation and drafts', () => {
  it('drafts survive a launch where MSAL no longer knows the account', async () => {
    draft('t:remembered')
    cached = []
    open()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('signed out'))
    expect(readCheckInCopies('t:remembered').plan?.pending).toHaveLength(1)
  })

  it('asks before a sign-in that could replace drafts belonging to an account the app no longer shows', async () => {
    const user = userEvent.setup()
    draft('t:remembered')
    cached = []
    open()
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('signed out'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'sign in' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(msal.loginRedirect).not.toHaveBeenCalled()
    expect(readCheckInCopies('t:remembered').plan?.pending).toHaveLength(1)
    confirm.mockRestore()
  })

  it('a different runner signing in never sees the previous runner’s drafts', async () => {
    draft('t:remembered')
    const fresh = account('fresh')
    cached = [remembered, fresh]
    redirectResult = { account: fresh }
    open()
    expect(await screen.findByText('fresh@example.com')).toBeInTheDocument()
    expect(readCheckInCopies('t:remembered')).toEqual({})
    expect(readCheckInCopies('t:fresh')).toEqual({})
  })
})

describe('duplicate taps and sign-out failure paths', () => {
  it('a double tap on Continue securely starts one interaction only', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    await user.click(screen.getByRole('button', { name: 'continue securely' }))
    await user.click(screen.getByRole('button', { name: 'continue securely' }))
    await waitFor(() => expect(msal.acquireTokenRedirect).toHaveBeenCalledOnce())
  })

  it('a double tap on sign out signs out once', async () => {
    const user = userEvent.setup()
    active = remembered
    await renderWith(false)
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(calls).toEqual(['clear:all', 'logout:remembered']))
  })

  it('signing out offline clears this device and shows the signed-out page without going to Microsoft', async () => {
    const user = userEvent.setup()
    active = remembered
    await renderWith(false)
    const connection = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      await user.click(screen.getByRole('button', { name: 'sign out' }))
      await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('signed out'))
      expect(calls).toEqual(['clear:all'])
      expect(cached).toEqual([])
    } finally { connection.mockRestore() }
  })

  it('a sign-out Microsoft cannot complete still leaves this device signed out, with a visible reason', async () => {
    const user = userEvent.setup()
    active = remembered
    await renderWith(false)
    msal.logoutRedirect.mockRejectedValueOnce(new AuthError('no_network_connectivity', 'Synthetic'))
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('signed out'))
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
    expect(screen.getByTestId('error')).toHaveTextContent('couldn’t reach Microsoft')
  })
})


describe('late token responses and other browser tabs', () => {
  it('closes the session when MSAL returns an empty API token', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    msal.acquireTokenSilent.mockResolvedValueOnce({ accessToken: '' })
    await user.click(screen.getByRole('button', { name: 'read token' }))
    expect(await screen.findByText('no token')).toBeVisible()
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
  })

  it('discards an API token resolved after sign-out instead of reopening private UI', async () => {
    const user = userEvent.setup()
    await renderWith(false)
    let finish!: (token: { accessToken: string }) => void
    msal.acquireTokenSilent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await user.click(screen.getByRole('button', { name: 'read token' }))
    await user.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('signed out'))
    await act(async () => finish({ accessToken: 'late-synthetic-token' }))
    expect(await screen.findByText('no token')).toBeVisible()
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
  })

  it.each([EventType.LOGOUT_SUCCESS, EventType.ACTIVE_ACCOUNT_CHANGED])('closes private UI after %s in another tab and discards a pending token', async eventType => {
    const user = userEvent.setup()
    await renderWith(false)
    let finish!: (token: { accessToken: string }) => void
    msal.acquireTokenSilent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await user.click(screen.getByRole('button', { name: 'read token' }))
    cached = eventType === EventType.LOGOUT_SUCCESS ? [] : [remembered, account('other')]
    active = eventType === EventType.LOGOUT_SUCCESS ? null : cached[1] ?? null
    act(() => accountEvent?.({ eventType } as EventMessage))
    expect(screen.getByTestId('who')).toHaveTextContent('signed out')
    expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
    await act(async () => finish({ accessToken: 'late-synthetic-token' }))
    expect(await screen.findByText('no token')).toBeVisible()
    expect(msal.acquireTokenRedirect).not.toHaveBeenCalled()
  })

  it('keeps this session when an unrelated cached account is removed', async () => {
    await renderWith(false)
    act(() => accountEvent?.({ eventType: EventType.LOGOUT_SUCCESS } as EventMessage))
    expect(screen.getByTestId('who')).toHaveTextContent('remembered@example.com')
    expect(screen.getByTestId('verified')).toHaveTextContent('verified')
  })

  it('removes the cross-tab subscription on unmount', async () => {
    const view = open()
    await screen.findByText('remembered@example.com')
    view.unmount()
    expect(msal.removeEventCallback).toHaveBeenCalledWith('listener')
  })
})

it('does not reopen the startup account after another tab changes identity during silent acquisition', async () => {
  let finish!: (token: { accessToken: string }) => void
  msal.acquireTokenSilent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  open()
  await waitFor(() => expect(msal.acquireTokenSilent).toHaveBeenCalledOnce())
  const other = account('other')
  cached = [other]
  active = other
  act(() => accountEvent?.({ eventType: EventType.ACTIVE_ACCOUNT_CHANGED } as EventMessage))
  await act(async () => finish({ accessToken: 'late-startup-token' }))
  expect(screen.getByTestId('who')).toHaveTextContent('signed out')
  expect(screen.getByTestId('verified')).toHaveTextContent('needs sign-in')
})

it('shows configuration errors from a quiet return instead of hiding them as an ended session', async () => {
  sessionStorage.setItem('taperday.quiet-renewal', 'pending')
  msal.handleRedirectPromise.mockRejectedValueOnce(new ServerError('invalid_request', 'synthetic', 'AADSTS50011: Synthetic redirect mismatch.'))
  open()
  await screen.findByText('remembered@example.com')
  expect(screen.getByTestId('error')).toHaveTextContent('set up correctly')
  expect(screen.getByTestId('error')).toHaveTextContent('AADSTS50011')
})
