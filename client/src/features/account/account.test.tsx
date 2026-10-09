import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AuthContext, type Auth } from '../../app/auth-context'
import type { Runner, SavedPlanSummary } from '../../lib/types'
import { server } from '../../test/server'

const TOKEN = 'test-token'
const link = '?km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08'

const thandi: Runner = {
  id: 'runner-1',
  displayName: 'Thandi',
  email: 'thandi@example.com',
  timeZone: 'Africa/Johannesburg',
  units: 'Kilometres',
  weeklyEmails: true,
  consentedAt: '2026-10-08T09:00:00Z',
}

/** A tiny in-memory stand-in for the account API that insists on the bearer token. */
function accountApi(start: { runner: Runner | null; plans?: SavedPlanSummary[] }) {
  const db = { runner: start.runner, plans: [...(start.plans ?? [])], saved: [] as unknown[], profiles: [] as unknown[] }
  const authorised = (request: Request) => request.headers.get('Authorization') === `Bearer ${TOKEN}`
  const unauthorised = () => HttpResponse.json({ title: 'Unauthorized' }, { status: 401 })

  server.use(
    http.get('*/api/v1/me', ({ request }) =>
      !authorised(request) ? unauthorised() : db.runner ? HttpResponse.json(db.runner) : HttpResponse.json({ title: 'Not found' }, { status: 404 }),
    ),
    http.put('*/api/v1/me', async ({ request }) => {
      if (!authorised(request)) return unauthorised()
      const body = (await request.json()) as Record<string, unknown>
      db.profiles.push(body)
      db.runner = { ...thandi, displayName: String(body.displayName) }
      return HttpResponse.json(db.runner)
    }),
    http.delete('*/api/v1/me', ({ request }) => {
      if (!authorised(request)) return unauthorised()
      db.runner = null
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('*/api/v1/me/export', ({ request }) => (authorised(request) ? HttpResponse.json({ profile: db.runner, plans: [] }) : unauthorised())),
    http.get('*/api/v1/me/plans', ({ request }) => (authorised(request) ? HttpResponse.json(db.plans) : unauthorised())),
    http.post('*/api/v1/me/plans', async ({ request }) => {
      if (!authorised(request)) return unauthorised()
      db.saved.push(await request.json())
      return HttpResponse.json({ id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z' }, { status: 201 })
    }),
    http.delete('*/api/v1/me/plans/:id', ({ request, params }) => {
      if (!authorised(request)) return unauthorised()
      db.plans = db.plans.filter((p) => p.id !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('*/api/v1/me/plans/:id', ({ request }) =>
      authorised(request)
        ? HttpResponse.json({
            id: 'plan-1',
            name: 'Parkrun PB',
            createdAt: '2026-10-08T09:00:00Z',
            inputs: {
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
            },
            plan: {},
          })
        : unauthorised(),
    ),
  )
  return db
}

const signedIn = (overrides: Partial<Auth> = {}): Auth => ({
  enabled: true,
  loading: false,
  account: { name: 'Thandi', email: 'thandi@example.com' },
  signIn: vi.fn(),
  signOut: vi.fn(),
  getToken: () => Promise.resolve(TOKEN),
  ...overrides,
})

const signedOut = (): Auth => ({ ...signedIn(), account: null, getToken: () => Promise.resolve(null) })

function renderWith(auth: Auth) {
  const user = userEvent.setup()
  render(
    <AuthContext.Provider value={auth}>
      <App />
    </AuthContext.Provider>,
  )
  return user
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 9, 0))
})

afterEach(() => vi.useRealTimers())

describe('when accounts are switched off', () => {
  it('shows no sign-in anywhere', async () => {
    window.history.replaceState(null, '', `/${link}`)
    render(<App />)

    await screen.findByRole('heading', { name: 'Parkrun PB' })
    expect(screen.queryByRole('button', { name: /Sign in/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save to My plans/ })).not.toBeInTheDocument()
  })
})

describe('signed out', () => {
  it('offers sign-in in the header and on the plan', async () => {
    const auth = signedOut()
    window.history.replaceState(null, '', `/${link}`)
    const user = renderWith(auth)
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    await user.click(screen.getByRole('button', { name: 'Sign in to save this plan' }))

    expect(within(screen.getByRole('navigation', { name: 'Account' })).getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(auth.signIn).toHaveBeenCalled()
  })
})

describe('signing up', () => {
  it('needs the privacy notice accepted, then saves the profile with the runner’s time zone', async () => {
    const db = accountApi({ runner: null })
    const user = renderWith(signedIn())

    await user.click(await screen.findByRole('button', { name: 'finish signing up' }))
    const name = screen.getByLabelText('What should we call you?')
    await user.clear(name)
    await user.type(name, 'Thandi M')
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))
    expect(screen.getByText(/accept the privacy notice/)).toBeInTheDocument()
    expect(db.profiles).toHaveLength(0)

    await user.click(screen.getByRole('checkbox', { name: /I’ve read this/ }))
    await user.click(screen.getByRole('button', { name: 'Finish signing up' }))

    expect(await screen.findByRole('button', { name: 'My plans' })).toBeInTheDocument()
    expect(db.profiles[0]).toMatchObject({ displayName: 'Thandi M', acceptPrivacyNotice: true, units: 'Kilometres' })
    expect(typeof (db.profiles[0] as { timeZone: string }).timeZone).toBe('string')
  })
})

describe('a signed-up runner', () => {
  it('saves the plan they just built, exactly as built', async () => {
    const db = accountApi({ runner: thandi })
    window.history.replaceState(null, '', `/${link}`)
    const user = renderWith(signedIn())
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    await user.click(await screen.findByRole('button', { name: 'Save to My plans' }))

    expect(await screen.findByRole('button', { name: 'Saved. Open My plans' })).toBeInTheDocument()
    expect(db.saved[0]).toMatchObject({ plan: { distanceKm: 5, raceDate: '2026-12-13', goalTime: '00:24:30', planFrom: '2026-10-08' } })
  })

  it('sees an empty state before saving anything', async () => {
    accountApi({ runner: thandi })
    const user = renderWith(signedIn())

    await user.click(await screen.findByRole('button', { name: 'My plans' }))

    expect(await screen.findByText(/No saved plans yet/)).toBeInTheDocument()
  })

  it('opens a saved plan', async () => {
    accountApi({
      runner: thandi,
      plans: [{ id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z' }],
    })
    const user = renderWith(signedIn())
    await user.click(await screen.findByRole('button', { name: 'My plans' }))

    await user.click(await screen.findByRole('button', { name: 'Open' }))

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(window.location.search).toContain('goal=1470')
  })

  it('asks before deleting a saved plan', async () => {
    const db = accountApi({
      runner: thandi,
      plans: [{ id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z' }],
    })
    const user = renderWith(signedIn())
    await user.click(await screen.findByRole('button', { name: 'My plans' }))

    await user.click(await screen.findByRole('button', { name: 'Delete Parkrun PB' }))
    expect(db.plans).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(await screen.findByText(/No saved plans yet/)).toBeInTheDocument()
    expect(db.plans).toHaveLength(0)
  })

  it('can delete their account after confirming, which signs them out', async () => {
    const auth = signedIn()
    const db = accountApi({ runner: thandi })
    const user = renderWith(auth)
    await user.click(await screen.findByRole('button', { name: 'Account' }))

    await user.click(await screen.findByRole('button', { name: 'Delete my account' }))
    expect(db.runner).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Yes, delete everything' }))

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(db.runner).toBeNull()
  })

  it('is told plainly when their sign-in has expired', async () => {
    accountApi({ runner: thandi })
    server.use(http.get('*/api/v1/me/plans', () => HttpResponse.json({}, { status: 401 })))
    const user = renderWith(signedIn())

    await user.click(await screen.findByRole('button', { name: 'My plans' }))

    expect(await screen.findByText(/sign-in has expired/)).toBeInTheDocument()
  })
})
