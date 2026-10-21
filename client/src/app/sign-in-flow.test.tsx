import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInWait, SLOW_AFTER_MS } from '../features/account/SignInWait'
import { api } from '../lib/api-client'
import type { Runner } from '../lib/types'
import { server, stravaOff } from '../test/server'
import { App } from './App'
import { AuthContext, type Auth } from './auth-context'

const thandi: Runner = {
  id: 'runner-1',
  displayName: 'Thandi',
  email: 'thandi@example.com',
  timeZone: 'Africa/Johannesburg',
  units: 'Kilometres',
  weeklyEmails: false,
  consentedAt: '2026-10-08T09:00:00Z',
  maxHeartRate: null,
}

const signedIn = (overrides: Partial<Auth> = {}): Auth => ({
  enabled: true,
  loading: false,
  account: { name: 'Thandi', email: 'thandi@example.com' },
  error: null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getToken: () => Promise.resolve('test-token'),
  ...overrides,
})

const renderApp = (auth: Auth) =>
  render(
    <AuthContext.Provider value={auth}>
      <App />
    </AuthContext.Provider>,
  )

afterEach(() => vi.useRealTimers())

describe('waiting for a sleeping server after sign-in', () => {
  it('explains the wait after a few seconds and offers a way out', async () => {
    vi.useFakeTimers()
    const onRetry = vi.fn()
    const onSignOut = vi.fn()
    render(<SignInWait onRetry={onRetry} onSignOut={onSignOut} />)

    expect(screen.getByText(/Checking your account/)).toBeInTheDocument()
    expect(screen.queryByText(/Waking Taperday up/)).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))

    expect(screen.getByText(/Waking Taperday up/)).toBeInTheDocument()
    vi.useRealTimers()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onRetry).toHaveBeenCalled()
    expect(onSignOut).toHaveBeenCalled()
  })

  it('never leaves a blank page on My plans, My runs or Account while the account loads', async () => {
    server.use(
      http.get('*/api/v1/me', async () => {
        await delay('infinite')
        return HttpResponse.json(thandi)
      }),
    )

    for (const view of ['plans', 'runs', 'account']) {
      window.history.replaceState(null, '', `/?view=${view}`)
      const { unmount } = renderApp(signedIn())

      expect(await screen.findByText(/Checking your account/)).toBeInTheDocument()
      // Sign out stays reachable in the header while waiting.
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
      unmount()
    }
  })
})

describe('reads that meet a waking server', () => {
  it('are retried once after a 503, and writes are not', async () => {
    let reads = 0
    let writes = 0
    server.use(
      http.get('*/api/v1/me', () => {
        reads++
        return reads === 1 ? HttpResponse.json({}, { status: 503 }) : HttpResponse.json(thandi)
      }),
      http.put('*/api/v1/me', () => {
        writes++
        return HttpResponse.json({}, { status: 503 })
      }),
    )

    await expect(api.me.get('t')).resolves.toMatchObject({ displayName: 'Thandi' })
    expect(reads).toBe(2)

    await expect(api.me.save('t', { displayName: 'T', timeZone: 'UTC', units: 'Kilometres', weeklyEmails: false, acceptPrivacyNotice: true, maxHeartRate: null })).rejects.toThrow()
    expect(writes).toBe(1)
  })
})

describe('dead ends', () => {
  it('a plan that can’t be built still offers a way to build a different one', async () => {
    server.use(http.post('*/api/v1/plans', () => HttpResponse.json({ title: 'Not found', detail: 'That race is no longer on the calendar.' }, { status: 404 })))
    window.history.replaceState(null, '', '/?race=gone-2025&goal=1470&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08')
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Build a different plan' }))

    expect(screen.queryByText('We couldn’t build that plan.')).not.toBeInTheDocument()
  })

  it('says Strava is still connecting instead of offering Connect again', async () => {
    server.use(
      http.get('*/api/v1/me', () => HttpResponse.json(thandi)),
      http.get('*/api/v1/me/sync/strava', () => HttpResponse.json({ ...stravaOff, available: true })),
      http.post('*/api/v1/me/sync/strava', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    window.history.replaceState(null, '', '/strava/callback?state=s&code=c&scope=read,activity:read_all')
    renderApp(signedIn())

    expect(await screen.findByText('Finishing connecting Strava…')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Connect with Strava' })).not.toBeInTheDocument())
  })
})
