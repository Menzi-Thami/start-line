import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInWait } from '../features/account/SignInWait'
import { followWake, SCENE_MS, SCENES, SLOW_AFTER_MS, TIP_MS, TIPS, type WakeStep } from '../features/account/wait-film'
import { WAKE_TRIES } from '../features/account/useRunner'
import { api } from '../lib/api-client'
import { ownerOf, readSnapshot, saveSnapshot } from '../lib/home-snapshot'
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
  privacyNoticeVersion: '2026-10-21',
  needsPrivacyConsent: false,
  heartRateConsent: true,
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
    server.use(http.get('*/health/live', () => new HttpResponse(null, { status: 503 })))
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

  it('plays a short film in order while it waits, then keeps running laps', async () => {
    vi.useFakeTimers()
    render(<SignInWait onRetry={vi.fn()} onSignOut={vi.fn()} />)
    const seen: string[] = []

    for (let i = 0; i < SCENES.length + 2; i++) {
      seen.push(SCENES.find((s) => screen.queryByText(s.caption))!.caption)
      await act(() => vi.advanceTimersByTimeAsync(SCENE_MS))
    }

    expect(seen).toEqual([
      'Waking the coach',
      'On your marks',
      'And they’re off',
      'Ticking off the kilometres',
      'Through the tape',
      'And they’re off',
      'Ticking off the kilometres',
    ])
  })

  it('keeps each running tip up long enough to read, but tells a screen reader only that the account is being checked', async () => {
    vi.useFakeTimers()
    const { container } = render(<SignInWait onRetry={vi.fn()} onSignOut={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(/^Checking your account$/)
    expect(screen.getByText(TIPS[0]!)).toBeInTheDocument()
    // A scene changes before the tip does: the film moves on, the tip stays.
    await act(() => vi.advanceTimersByTimeAsync(SCENE_MS))
    expect(screen.getByText(TIPS[0]!)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(TIP_MS - SCENE_MS))
    expect(screen.getByText(TIPS[1]!)).toBeInTheDocument()

    expect(container.querySelector('.wait-film')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.wait-tip')).toHaveAttribute('aria-hidden', 'true')
  })

  it('says how far the wake has got, and shows a loader once only the account is left', async () => {
    let ready = false
    server.use(http.get('*/health/ready', () => (ready ? new HttpResponse('Healthy') : new HttpResponse(null, { status: 503 }))))
    const { container } = render(<SignInWait onRetry={vi.fn()} onSignOut={vi.fn()} />)

    expect(await screen.findByText(/Taperday’s up. Fetching your training/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(container.querySelector('.wait-spinner')).not.toBeInTheDocument()

    ready = true
    expect(await screen.findByText(/Almost there/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(container.querySelector('.wait-spinner')).toBeInTheDocument()
  })

  it('follows the wake in order, server then database, and stops when the wait is over', async () => {
    const answers = { live: [false, false, true], ready: [false, true] }
    const steps: WakeStep[] = []
    await followWake(
      (check) => Promise.resolve(answers[check].shift() ?? true),
      () => Promise.resolve(),
      (step) => steps.push(step),
      () => false,
    )
    expect(steps).toEqual(['database', 'almost'])

    const none: WakeStep[] = []
    await followWake(
      () => Promise.resolve(false),
      () => Promise.resolve(),
      (step) => none.push(step),
      () => true,
    )
    expect(none).toEqual([])
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

describe('Home from the copy kept on this device', () => {
  afterEach(() => window.localStorage.clear())

  it('shows at once while the database wakes, then carries on with the real answers', async () => {
    saveSnapshot(ownerOf({ name: 'Thandi', email: 'thandi@example.com' }), { runner: thandi, current: null })
    let answer: (() => void) | undefined
    server.use(
      http.get('*/api/v1/me', async () => {
        await new Promise<void>((resolve) => (answer = resolve))
        return HttpResponse.json(thandi)
      }),
    )
    window.history.replaceState(null, '', '/?view=home')

    renderApp(signedIn())

    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
    expect(screen.getByText(/while Taperday catches up/)).toBeInTheDocument()
    expect(screen.queryByText(/Checking your account/)).not.toBeInTheDocument()

    await waitFor(() => expect(answer).toBeDefined())
    answer!()
    await waitFor(() => expect(screen.queryByText(/while Taperday catches up/)).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
  })

  it('is never shown to someone else signed in on the same device', async () => {
    saveSnapshot(ownerOf({ name: 'Sipho', email: 'sipho@example.com' }), { runner: { ...thandi, displayName: 'Sipho' } })
    server.use(
      http.get('*/api/v1/me', async () => {
        await delay('infinite')
        return HttpResponse.json(thandi)
      }),
    )
    window.history.replaceState(null, '', '/?view=home')

    renderApp(signedIn())

    expect(await screen.findByText(/Checking your account/)).toBeInTheDocument()
    expect(screen.queryByText(/Sipho/)).not.toBeInTheDocument()
    expect(readSnapshot(ownerOf({ name: 'Sipho', email: 'sipho@example.com' }))).toBeNull()
  })
})

describe('signing in while the server wakes', () => {
  it('keeps waiting through a slow wake instead of failing the sign-in', async () => {
    // A server that's still starting answers fast with an error. Seven of those once used up every try inside a minute
    // and showed "We couldn't load your account"; now the sign-in keeps going until the database is back.
    let reads = 0
    server.use(
      http.get('*/api/v1/me', () => {
        reads++
        return reads <= 7 ? HttpResponse.json({}, { status: 503 }) : HttpResponse.json(thandi)
      }),
    )
    window.history.replaceState(null, '', '/?view=account')

    renderApp(signedIn())

    expect(await screen.findByRole('heading', { name: /Account/ }, { timeout: 5000 })).toBeInTheDocument()
    expect(reads).toBe(8)
  })

  it('gives up in the end on a server that never wakes, with a way to try again', async () => {
    let reads = 0
    server.use(
      http.get('*/api/v1/me', () => {
        reads++
        return HttpResponse.json({}, { status: 503 })
      }),
    )

    renderApp(signedIn())

    expect((await screen.findAllByText(/We couldn’t load your account/, {}, { timeout: 5000 })).length).toBeGreaterThan(0)
    // Each try is the API client's read plus its own one retry.
    expect(reads).toBe(2 * WAKE_TRIES)
  })

  it('still gives up on an answer that isn’t about waking', async () => {
    let reads = 0
    server.use(
      http.get('*/api/v1/me', () => {
        reads++
        return HttpResponse.json({ title: 'Forbidden' }, { status: 403 })
      }),
    )

    renderApp(signedIn())

    expect((await screen.findAllByText(/Forbidden/)).length).toBeGreaterThan(0)
    expect(reads).toBe(1)
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
