import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInWait } from '../features/account/SignInWait'
import { followWake, SLOW_AFTER_MS, type WakeStep } from '../features/account/wait-film'
import { WAKE_TRIES } from '../features/account/useRunner'
import { api } from '../lib/api-client'
import { ownerOf, readSnapshot, saveSnapshot } from '../lib/home-snapshot'
import type { GeneratePlanRequest, Runner } from '../lib/types'
import { lastPlanRequest, planFixture, server, stravaOff } from '../test/server'
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
  it('keeps a fast account load compact without decorative film or extra health requests', async () => {
    let checks = 0
    server.use(http.get('*/health/:check', () => { checks++; return new HttpResponse('Healthy') }))
    vi.useFakeTimers()
    const { container, unmount } = render(<SignInWait onRetry={vi.fn()} onSignOut={vi.fn()} />)
    await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 1))
    expect(screen.getByRole('status')).toHaveTextContent('Checking your account')
    expect(container.querySelector('.wait-film')).toBeNull()
    expect(container.querySelector('.wait-tip')).toBeNull()
    expect(checks).toBe(0)
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS * 2))
    expect(checks).toBe(0)
  })

  it('explains the wait after a few seconds and offers a way out', async () => {
    server.use(http.get('*/health/live', () => new HttpResponse(null, { status: 503 })))
    vi.useFakeTimers()
    const onRetry = vi.fn()
    const onSignOut = vi.fn()
    render(<SignInWait onRetry={onRetry} onSignOut={onSignOut} />)

    expect(screen.getByText(/Checking your account/)).toBeInTheDocument()
    expect(screen.queryByText(/Connecting to Taperday/)).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))

    expect(screen.getByText(/Connecting to Taperday/)).toBeInTheDocument()
    vi.useRealTimers()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onRetry).toHaveBeenCalled()
    expect(onSignOut).toHaveBeenCalled()
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

  it('shows the saved page quietly while the account loads, then displays the fresh answers', async () => {
    saveSnapshot(ownerOf({ name: 'Thandi', email: 'thandi@example.com' }), { runner: thandi, current: null })
    let answer: (() => void) | undefined
    server.use(
      http.get('*/api/v1/me', async () => {
        await new Promise<void>((resolve) => (answer = resolve))
        return HttpResponse.json({ ...thandi, displayName: 'Thandi refreshed' })
      }),
    )
    window.history.replaceState(null, '', '/?view=home')

    renderApp(signedIn())

    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
    expect(screen.queryByText(/while Taperday catches up/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Checking your account/)).not.toBeInTheDocument()

    await waitFor(() => expect(answer).toBeDefined())
    answer!()
    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi refreshed' })).toBeInTheDocument()
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

  it('opens the installed app on Home at once for a runner this device knows, even one without a plan yet', async () => {
    saveSnapshot(ownerOf({ name: 'Thandi', email: 'thandi@example.com' }), { runner: thandi, current: null })
    server.use(
      http.get('*/api/v1/me', async () => {
        await delay('infinite')
        return HttpResponse.json(thandi)
      }),
    )
    // The app's start page, the way the home-screen icon opens it.
    window.history.replaceState(null, '', '/')

    renderApp(signedIn())

    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
    expect(screen.queryByText(/while Taperday catches up/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Checking your account/)).not.toBeInTheDocument()
  })

  it('shows a runner this device hasn’t seen the page at once, finding their plan meanwhile', async () => {
    server.use(
      http.get('*/api/v1/me', async () => {
        await delay('infinite')
        return HttpResponse.json(thandi)
      }),
    )
    window.history.replaceState(null, '', '/')

    renderApp(signedIn())

    // No waiting screen: one line says their plan is on its way, and the page under it works.
    expect(await screen.findByText(/Finding your plan/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Which race?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back, Thandi' })).not.toBeInTheDocument()
  })
})

describe('their plan from the copy kept on this device', () => {
  afterEach(() => window.localStorage.clear())

  const owner = ownerOf({ name: 'Thandi', email: 'thandi@example.com' })
  const inputs: GeneratePlanRequest = {
    raceSlug: null,
    raceName: 'Parkrun PB',
    distanceKm: 5,
    raceDate: '2026-12-13',
    goalTime: '00:24:30',
    runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'],
    longRunDay: 'Sunday',
    currentWeeklyKm: null,
    experience: 'Regular',
    strengthDays: [],
    planFrom: '2026-10-08',
  }
  const current = { id: 'plan-1', name: 'Parkrun PB', inputs }
  const summary = { id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z', status: 'Active' }
  const sleepingAccount = () =>
    server.use(
      http.get('*/api/v1/me', async () => {
        await delay('infinite')
        return HttpResponse.json(thandi)
      }),
    )

  it('opens a runner who comes back straight on their plan, with no wait', async () => {
    saveSnapshot(owner, { runner: thandi, current, plan: { id: 'plan-1', plan: planFixture } })
    sleepingAccount()
    window.history.replaceState(null, '', '/')

    renderApp(signedIn())

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(screen.queryByText(/while Taperday catches up/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Checking your account/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back, Thandi' })).not.toBeInTheDocument()
    // The copy is simply there: no reveal, as there's nothing new to show.
    expect(document.querySelector('section.plan')).not.toHaveClass('plan-reveal')
    // The plan's own link, as opening it from Home gives.
    expect(window.location.search).toContain('goal=1470')
    expect(window.location.search).toContain('from=2026-10-08')
  })

  it('then brings it up to date from the account, coach and all, and Home is a tap away', async () => {
    saveSnapshot(owner, { runner: thandi, current, plan: { id: 'plan-1', plan: planFixture } })
    const coached = { ...planFixture, weeks: planFixture.weeks.map((w, i) => (i === 0 ? { ...w, plannedKm: w.plannedKm + 1 } : w)) }
    let answer: (() => void) | undefined
    let coachCalls = 0
    server.use(
      http.get('*/api/v1/me', async () => {
        await new Promise<void>((resolve) => (answer = resolve))
        return HttpResponse.json(thandi)
      }),
      http.get('*/api/v1/me/plans', () => HttpResponse.json([summary])),
      http.get('*/api/v1/me/plans/:id', () => HttpResponse.json({ ...current, createdAt: '2026-10-08T09:00:00Z', status: 'Active', plan: planFixture })),
      http.post('*/api/v1/me/plans/:id/coach', () => {
        coachCalls++
        return HttpResponse.json({ ...current, createdAt: '2026-10-08T09:00:00Z', status: 'Active', plan: coached, coaching: [] })
      }),
    )
    window.history.replaceState(null, '', '/')
    const user = userEvent.setup()

    renderApp(signedIn())
    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(screen.queryByText(/while Taperday catches up/)).not.toBeInTheDocument()
    await waitFor(() => expect(answer).toBeDefined())
    answer!()

    await waitFor(() => expect(readSnapshot(owner)?.plan?.plan).toEqual(coached), { timeout: 3000 })
    expect(coachCalls).toBe(1)
    expect(screen.getByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    // Kept on this device as the coach has it, for next time.
    expect(readSnapshot(owner)?.plan?.plan).toEqual(coached)

    await user.click(screen.getByRole('button', { name: 'Home' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
    window.history.back()
    expect(await screen.findByRole('tablist', { name: 'Your plan' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
  })

  it('fades a page in when the runner moves to it', async () => {
    saveSnapshot(owner, { runner: thandi, current })
    server.use(
      http.get('*/api/v1/me', () => HttpResponse.json(thandi)),
      http.get('*/api/v1/me/plans', () => HttpResponse.json([summary])),
      http.get('*/api/v1/me/plans/:id', () => HttpResponse.json({ ...current, createdAt: '2026-10-08T09:00:00Z', status: 'Active', plan: planFixture })),
      http.post('*/api/v1/me/plans/:id/coach', () =>
        HttpResponse.json({ ...current, createdAt: '2026-10-08T09:00:00Z', status: 'Active', plan: planFixture, coaching: [] }),
      ),
      http.get('*/api/v1/me/activities', () => HttpResponse.json([])),
    )
    window.history.replaceState(null, '', '/')
    const user = userEvent.setup()

    renderApp(signedIn())

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'My runs' }))
    expect(screen.getByRole('main')).toHaveClass('view-enter')
  })

  it('opens their plan by itself once the account answers, keeping the page usable until then', async () => {
    let answer: (() => void) | undefined
    server.use(
      http.get('*/api/v1/me', async () => {
        await new Promise<void>((resolve) => (answer = resolve))
        return HttpResponse.json(thandi)
      }),
      http.get('*/api/v1/me/plans', () => HttpResponse.json([summary])),
      http.get('*/api/v1/me/plans/:id', () => HttpResponse.json({ ...current, createdAt: '2026-10-08T09:00:00Z', status: 'Active', plan: planFixture })),
      http.get('*/api/v1/me/activities', () => HttpResponse.json([])),
    )
    window.history.replaceState(null, '', '/')

    renderApp(signedIn())

    expect(await screen.findByText(/Signed in as Thandi/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Which race?' })).toBeInTheDocument()

    await waitFor(() => expect(answer).toBeDefined())
    answer!()

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(/Finding your plan/)).not.toBeInTheDocument()
  })

  it('opens on their plan, built from its answers, when the copy here has only which plan it is', async () => {
    // Home never loaded the plan itself on this device, so it's built afresh: that needs the API, not the sleeping database.
    saveSnapshot(owner, { runner: thandi, current })
    sleepingAccount()
    window.history.replaceState(null, '', '/')

    renderApp(signedIn())

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back, Thandi' })).not.toBeInTheDocument()
    expect(window.location.search).toContain('goal=1470')
  })

  it('never opens over a plan link, or for someone else signed in on the same device', async () => {
    saveSnapshot(owner, { runner: thandi, current, plan: { id: 'plan-1', plan: planFixture } })
    sleepingAccount()
    window.history.replaceState(null, '', '/?km=10&date=2027-01-10&name=Spring+10K&goal=3000&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08')
    const { unmount } = renderApp(signedIn())

    await waitFor(() => expect(lastPlanRequest.body).toMatchObject({ raceName: 'Spring 10K' }))
    expect(screen.queryByText(/Showing your plan/)).not.toBeInTheDocument()
    expect(window.location.search).toContain('name=Spring+10K')
    unmount()

    window.history.replaceState(null, '', '/')
    renderApp(signedIn({ account: { name: 'Sipho', email: 'sipho@example.com' } }))

    expect(await screen.findByText(/Finding your plan/)).toBeInTheDocument()
    expect(screen.queryByText(/Showing your plan/)).not.toBeInTheDocument()
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
