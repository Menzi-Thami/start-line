import { closePlanDay, findPlanControl, openRebuild, openWeekDay, openDisclosure } from '../../test/user-navigation'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AuthContext, type Auth } from '../../app/auth-context'
import type { CoachNote, Runner, SavedPlanSummary } from '../../lib/types'
import { calendarToken, newCalendarToken, planFixture, server } from '../../test/server'

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
  maxHeartRate: null,
  privacyNoticeVersion: '2026-10-21',
  needsPrivacyConsent: false,
  heartRateConsent: true,
  updateEmails: true,
  updateEmailsOffAt: null,
}

/** The runner's saved plan as the account API returns it, without the plan itself. */
const savedPlanBody = {
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
  status: 'Active',
}

/** A tiny in-memory stand-in for the account API that insists on the bearer token. */
function accountApi(start: { runner: Runner | null; plans?: SavedPlanSummary[]; coaching?: CoachNote[] }) {
  const db = {
    runner: start.runner,
    plans: [...(start.plans ?? [])],
    saved: [] as unknown[],
    profiles: [] as unknown[],
    restored: [] as string[],
    checkIns: [] as { path: string; body: Record<string, unknown> }[],
    coaching: [...(start.coaching ?? [])],
  }
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
      return HttpResponse.json({ id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z', status: 'Active' }, { status: 201 })
    }),
    // The runner's own plan opens through the coach: by default it has made no calls.
    http.post('*/api/v1/me/plans/:id/coach', ({ request }) =>
      authorised(request) ? HttpResponse.json({ ...savedPlanBody, plan: planFixture, coaching: db.coaching }) : unauthorised(),
    ),
    http.get('*/api/v1/me/plans/:id/check-ins', ({ request }) => (authorised(request) ? HttpResponse.json([]) : unauthorised())),
    http.put('*/api/v1/me/plans/:id/check-ins/:date/:type', async ({ request, params }) => {
      if (!authorised(request)) return unauthorised()
      const body = (await request.json()) as Record<string, unknown>
      db.checkIns.push({ path: `${String(params.id)}/${String(params.date)}/${String(params.type)}`, body })
      return HttpResponse.json({ ...body, date: params.date, sessionType: params.type, updatedAt: '2026-10-14T18:00:00Z' })
    }),
    http.post('*/api/v1/me/plans/:id/restore', ({ request, params }) => {
      if (!authorised(request)) return unauthorised()
      db.restored.push(String(params.id))
      db.plans = db.plans.map((p) => ({ ...p, status: p.id === params.id ? 'Active' : 'Archived' }))
      return HttpResponse.json(db.plans.find((p) => p.id === params.id))
    }),
    http.delete('*/api/v1/me/plans/:id', ({ request, params }) => {
      if (!authorised(request)) return unauthorised()
      db.plans = db.plans.filter((p) => p.id !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('*/api/v1/me/plans/:id', ({ request }) =>
      authorised(request)
        ? HttpResponse.json({ ...savedPlanBody, plan: planFixture })
        : unauthorised(),
    ),
  )
  return db
}

const signedIn = (overrides: Partial<Auth> = {}): Auth => ({
  enabled: true,
  loading: false,
  account: { name: 'Thandi', email: 'thandi@example.com' },
  error: null,
  signIn: vi.fn(),
  signUp: vi.fn(),
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
    expect(screen.queryByRole('button', { name: /Save plan/ })).not.toBeInTheDocument()
  })
})

describe('signed out', () => {
  it('locks a plan link until they sign in: which plan it is, never its sessions or calendar', async () => {
    const auth = signedOut()
    window.history.replaceState(null, '', `/${link}`)
    const user = renderWith(auth)
    const locked = await screen.findByRole('region', { name: 'Parkrun PB' })
    expect(locked).toHaveTextContent('Your plan is ready')
    expect(locked).toHaveTextContent(/weeks/)
    expect(screen.queryByRole('tablist', { name: 'Your plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Calendar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()

    await user.click(within(locked).getByRole('button', { name: 'Sign in' }))
    expect(auth.signIn).toHaveBeenCalled()
    await user.click(within(locked).getByRole('button', { name: 'Create a free account' }))
    expect(auth.signUp).toHaveBeenCalled()
    expect(within(screen.getByRole('navigation', { name: 'Account' })).getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('signing up comes first', () => {
  it('says why a sign-in didn’t finish instead of failing silently', async () => {
    const auth = { ...signedOut(), error: { message: 'Your sign-in timed out before it finished. Please try again.', code: 'AADSTS50132' } }
    const user = renderWith(auth)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your sign-in timed out before it finished.')
    // Microsoft's diagnostic code is for administrators, not runners.
    expect(alert).not.toHaveTextContent('AADSTS50132')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(auth.signIn).toHaveBeenCalled()
  })


  it('opens on why Taperday is worth it, with sign-up as the way in', async () => {
    const auth = signedOut()
    const user = renderWith(auth)

    expect(await screen.findByRole('heading', { name: 'Your race, your week, your plan' })).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
    expect(screen.getByText('A pace and a reason for every run')).toBeInTheDocument()
    // Nothing unbuilt is promised as if it were there.
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Comrades/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign up free' }))
    expect(auth.signUp).toHaveBeenCalled()

    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Sign in' }))
    expect(auth.signIn).toHaveBeenCalled()
  })

  it('requires profile consent, offers optional Strava, then continues to the race', async () => {
    const db = accountApi({ runner: null })
    const user = renderWith(signedIn())

    expect(await screen.findByRole('heading', { name: 'A bit about you' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'finish signing up' })).not.toBeInTheDocument()
    // Signing up is the only thing on screen: no landing hero, no race ticker.
    expect(screen.queryByRole('heading', { name: /Your race.s*Your plan./ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start your free plan' })).not.toBeInTheDocument()
    // Sign-up asks only for a name, a time zone and the privacy notice. Units follow the browser's locale; the weekly
    // emails start on; units, heart rate and email choices are changed later in Account.
    expect(screen.queryByRole('group', { name: 'Distances in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Weekly emails/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Keep heart rate/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your time zone')).toBeInTheDocument()
    const name = screen.getByLabelText('What should we call you?')
    await user.clear(name)
    await user.type(name, 'Thandi M')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText(/accept the privacy notice/)).toBeInTheDocument()
    expect(db.profiles).toHaveLength(0)

    await user.click(screen.getByRole('checkbox', { name: /I’ve read this/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('heading', { name: 'Bring your runs with you.' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Which race?' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: "I’ll connect later" }))
    expect(await screen.findByRole('heading', { name: 'Which race?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Runs' })).toBeInTheDocument()
    expect(db.profiles[0]).toMatchObject({ displayName: 'Thandi M', acceptPrivacyNotice: true, units: navigator.language.endsWith('-US') ? 'Miles' : 'Kilometres', weeklyEmails: true })
    expect(db.profiles[0]).not.toHaveProperty('heartRateConsent')
    expect(typeof (db.profiles[0] as { timeZone: string }).timeZone).toBe('string')
  })

  it('takes a returning runner straight to the questions', async () => {
    accountApi({ runner: thandi })
    renderWith(signedIn())

    expect(await screen.findByRole('heading', { name: 'Which race?' })).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your race, your week, your plan' })).not.toBeInTheDocument()
  })

  it('still opens a shared plan without an account', async () => {
    window.history.replaceState(null, '', `/${link}`)
    renderWith(signedOut())

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your race, your week, your plan' })).not.toBeInTheDocument()
  })
})

describe('a signed-up runner', () => {
  it('saves the plan they just built, exactly as built', async () => {
    const db = accountApi({ runner: thandi })
    window.history.replaceState(null, '', `/${link}`)
    const user = renderWith(signedIn())
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    await user.click(await findPlanControl('Save plan'))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(db.saved[0]).toMatchObject({ plan: { distanceKm: 5, raceDate: '2026-12-13', goalTime: '00:24:30', planFrom: '2026-10-08' } })
  })

  it('saves changed answers to the same current plan without a second save step', async () => {
    const db = accountApi({ runner: thandi })
    let persistedInputs: Record<string, unknown> = savedPlanBody.inputs
    server.use(
      http.post('*/api/v1/me/plans', async ({ request }) => {
        const body = await request.json() as { plan: Record<string, unknown> }
        db.saved.push(body)
        persistedInputs = body.plan
        db.plans = [{ id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', status: 'Active', createdAt: savedPlanBody.createdAt }]
        return HttpResponse.json(db.plans[0], { status: 201 })
      }),
      http.get('*/api/v1/me/plans/:id', () => HttpResponse.json({ ...savedPlanBody, inputs: persistedInputs, plan: planFixture })),
      http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json({ ...savedPlanBody, inputs: persistedInputs, plan: planFixture, coaching: [] })),
    )
    const user = renderWith(signedIn())
    const next = () => user.click(screen.getByRole('button', { name: 'Continue' }))

    await user.click(await screen.findByRole('radio', { name: /Comrades/ }))
    await next()
    const goal = screen.getByRole('group', { name: 'Goal finish time' })
    await user.type(within(goal).getByLabelText('Hours'), '11')
    await next()
    await next()
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))

    expect(await findPlanControl('Delete plan')).toBeInTheDocument()
    expect(db.saved).toHaveLength(1)

    await user.click(await screen.findByRole('button', { name: 'Edit plan' }))
    await user.click(screen.getByText('More options', { selector: 'summary' }))
    await user.click(within(screen.getByRole('group', { name: 'Strength and mobility days' })).getByRole('checkbox', { name: 'Monday' }))
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))

    await waitFor(() => expect(db.saved).toHaveLength(2))
    expect(await findPlanControl('Delete plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(db.plans).toHaveLength(1)
  })

  it('keeps an old My plans link useful by opening the permanent journey without a current plan', async () => {
    accountApi({ runner: thandi })
    window.history.replaceState(null, '', '/?view=plans')
    renderWith(signedIn())

    expect(await screen.findByRole('heading', { name: 'Your journey.' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Journey$/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: 'My plans' })).not.toBeInTheDocument()
  })

  // Signed in with a plan, they open inside it; Home is a tap away.
  const openTheirPlan = async (_user: ReturnType<typeof renderWith>) => screen.findByRole('heading', { name: 'Parkrun PB' }, { timeout: 3000 })

  it('asks before deleting their plan, then takes them home, where nothing of it is left', async () => {
    const db = accountApi({
      runner: thandi,
      plans: [{ id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z', status: 'Active' }],
    })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    // They open their plan and delete it from there.
    await openTheirPlan(user)

    await user.click(await findPlanControl('Delete plan'))
    expect(db.plans).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    // Home, offering a new plan, with nothing of the deleted one left on screen or in the link.
    expect(await screen.findByRole('heading', { name: 'What are you running towards?' })).toBeInTheDocument()
    expect(db.plans).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'Parkrun PB' })).not.toBeInTheDocument()
    expect(window.location.search).toBe('?view=home')

    // Building a new plan starts from a blank builder, and the wordmark never brings the deleted plan back.
    await user.click(await screen.findByRole('button', { name: 'Choose my goal' }))
    expect(screen.getByRole('heading', { name: 'Which race?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Taperday' }))
    expect(screen.queryByRole('heading', { name: 'Parkrun PB' })).not.toBeInTheDocument()
  })

  const current = { id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z', status: 'Active' } as const

  it('opening a saved plan from a Home deep link ends the account handoff instead of showing a second loader', async () => {
    accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/?view=home')
    const user = renderWith(signedIn())
    await screen.findByRole('heading', { name: 'Welcome back, Thandi' })
    const nav = screen.getByRole('navigation', { name: 'Main' })
    await user.click(await within(nav).findByRole('button', { name: 'Plan' }))
    await screen.findByRole('tab', { name: 'This week' })
    expect(document.querySelector('.finding-plan')).toBeNull()
    expect(screen.queryByText('Your account is taking longer than expected')).not.toBeInTheDocument()
  })

  it('goes Home from the Taperday wordmark, even from a half-finished change of answers', async () => {
    accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await openTheirPlan(user)

    await user.click(await screen.findByRole('button', { name: 'Edit plan' }))
    expect(screen.queryByRole('heading', { name: 'Parkrun PB' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Taperday' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi' }, { timeout: 3000 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Runs' }))
    await user.click(screen.getByRole('button', { name: 'Taperday' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi' }, { timeout: 3000 })).toBeInTheDocument()
  })

  it('comes back with the browser’s Back button instead of leaving Taperday', async () => {
    accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await openTheirPlan(user)

    await user.click(screen.getByRole('button', { name: 'Runs' }))
    expect(await screen.findByRole('heading', { name: 'Runs' })).toBeInTheDocument()
    window.history.back()

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(window.location.search).toContain('goal=1470')
  })

  it('opens inside their plan after signing in, with Home and today’s run a tap away', async () => {
    // Tuesday 13 October: hills day in week 1.
    vi.setSystemTime(new Date(2026, 9, 13, 7, 0))
    accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())

    await openTheirPlan(user)
    expect(await findPlanControl('Delete plan')).toBeInTheDocument()
    expect(window.location.search).toContain('goal=1470')
    expect(screen.queryByRole('heading', { name: 'Welcome back, Thandi' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Home' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi' }, { timeout: 3000 })).toBeInTheDocument()
    const today = await screen.findByRole('region', { name: 'Today' }, { timeout: 3000 })
    expect(await within(today).findByText('Hill repeats', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('opens today from Home in the canonical day screen and returns Home on Back', async () => {
    vi.setSystemTime(new Date(2026, 9, 13, 9))
    accountApi({ runner: thandi, plans: [current] })
    const user = renderWith(signedIn())
    await openTheirPlan(user)
    await user.click(screen.getByRole('button', { name: 'Home' }))
    const today = await screen.findByRole('region', { name: 'Today' })
    await user.click(await within(today).findByRole('button', { name: "Open today’s workout" }))
    const day = await screen.findByRole('region', { name: 'Tuesday 13 October 2026' }, { timeout: 10000 })
    expect(new URLSearchParams(window.location.search).get('day')).toBe('2026-10-13')
    await user.click(within(day).getByRole('button', { name: /Back to plan/ }))
    expect(await screen.findByRole('heading', { name: 'Welcome back, Thandi' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /^Plan$/ }))
    await user.click(await screen.findByRole('tab', { name: /^Progress$/ }))
    expect(screen.getByRole('button', { name: /^Plan$/ })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByRole('region', { name: 'Training progress' })).toBeVisible()
    expect(new URLSearchParams(window.location.search).get('planTab')).toBe('progress')
    await user.click(screen.getByRole('button', { name: 'Home' }))
    await user.click(await screen.findByRole('button', { name: 'Plan' }))
    expect(await screen.findByRole('tab', { name: 'This week' }, { timeout: 10000 })).toHaveAttribute('aria-selected', 'true')
  })

  it('checks in on a run of their plan: how it felt, and it’s ticked off', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 19, 0))
    const db = accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await openTheirPlan(user)

    // Tuesday's hills are a past unlogged session. Keep its view uncluttered until the runner
    // chooses to log it, then show the familiar two-tap effort rating.
    await openWeekDay('2026-10-13')
    await user.click(screen.getByRole('button', { name: 'Log how this run went' }))
    // The two-tap rating: how hard it felt, then Save as planned.
    const askers = await screen.findAllByRole('group', { name: 'How hard did it feel?' }, { timeout: 3000 })
    expect(askers).toHaveLength(1)
    await user.click(within(askers[0]!).getByRole('radio', { name: '7, Hard' }))
    await user.click(screen.getByRole('button', { name: 'Save as planned' }))
    expect(await screen.findByText('Rated 7/10 · As planned')).toBeInTheDocument()

    // One editable rating in the day detail, no duplicate feedback card under Recorded.
    // Saving it still records the runner's answer on the correct session.
    expect(screen.getByText('Rated 7/10 · As planned')).toBeInTheDocument()
    expect(db.checkIns).toEqual([{ path: 'plan-1/2026-10-13/Hills', body: expect.objectContaining({ status: 'Done', effort: 7 }) }])
    await closePlanDay()
    // Only the hills, of this week's runs, are ticked off.
    expect(screen.getByRole('button', { name: /^Tuesday 13 October 2026:/ })).toHaveAccessibleName(/Completed/)
  })

  it('opens the weekly review in Progress on this week’s coach’s note', async () => {
    // Tuesday of week 2, which the coach eased after week 1 felt too hard.
    vi.setSystemTime(new Date(2026, 9, 20, 7, 0))
    accountApi({
      runner: thandi,
      plans: [current],
      coaching: [
        { weekStart: '2026-10-19', verdict: 'Struggling', holdVolume: true, doseStep: -1, cutbackNow: false, reasons: ['FeltHarderThanPlanned'], fitness: null, paceFactor: 1 },
      ],
    })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await openTheirPlan(user)
    await user.click(screen.getByRole('tab', { name: 'Progress' }))

    const note = await screen.findByRole('region', { name: 'Coach’s note' }, { timeout: 3000 })
    expect(within(note).getByRole('heading', { name: 'An easier week' })).toBeInTheDocument()
    expect(within(note).getByText('Several runs last week felt harder than they should.')).toBeInTheDocument()
  })

  it('shows their plan in the units from their account profile, with no switch on the plan', async () => {
    accountApi({ runner: { ...thandi, units: 'Miles' }, plans: [current] })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await openTheirPlan(user)

    // A 5K is 3.1 miles.
    expect(await screen.findByText('3.1 mi', { selector: '.plan-facts > li' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Units' })).not.toBeInTheDocument()
  })

  it('isn’t asked about runs on a plan that isn’t theirs', async () => {
    vi.setSystemTime(new Date(2026, 9, 14, 19, 0))
    accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/?km=10&date=2027-01-10&name=Spring+10K&goal=3000&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08')
    renderWith(signedIn())

    expect(await findPlanControl('Make this my plan')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'How did it go?' })).not.toBeInTheDocument()
  })

  it('subscribes their calendar to their own feed, which follows their plan through every change', async () => {
    accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await openTheirPlan(user)

    await user.click(screen.getByText('Add to calendar'))

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Apple Calendar/ })).toHaveAttribute('href', expect.stringMatching(new RegExp(`^webcal://.*/api/v1/calendar/${calendarToken}\\.ics$`))),
    )
    const outlook = new URL(screen.getByRole('link', { name: /Outlook/ }).getAttribute('href')!)
    expect(outlook.searchParams.get('url')).toMatch(new RegExp(`/api/v1/calendar/${calendarToken}\\.ics$`))
    expect(screen.getByText('Your calendar stays in step with your plan, even when it changes.')).toBeInTheDocument()
  })

  it('subscribes a calendar to the plan’s own link when the plan isn’t theirs', async () => {
    accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/?km=10&date=2027-01-10&name=Spring+10K&goal=3000&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08')
    const user = renderWith(signedIn())
    await findPlanControl('Make this my plan')

    await user.click(screen.getByText('Add to calendar'))

    expect(screen.getByRole('link', { name: /Apple Calendar/ }).getAttribute('href')).toContain('/api/v1/plans/calendar.ics?')
    expect(screen.getByText('Subscribing keeps your calendar in step with your plan.')).toBeInTheDocument()
  })

  it('groups account settings that open in place, with no duplicate shortcut buttons', async () => {
    accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await user.click(await screen.findByRole('button', { name: 'Account' }))
    const account = await screen.findByRole('region', { name: 'Account' })
    expect(screen.queryByRole('navigation', { name: 'Jump to account settings' })).toBeNull()
    // Four groups, then Sign out. No overview panel repeating who is signed in.
    expect([...account.querySelectorAll('.account-groups > details > summary')].map(summary => summary.textContent))
      .toEqual(['Profile', 'Connections', 'Notifications', 'Data & privacy'])
    expect(within(account).getAllByText(/Signed in as/)).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Account overview' })).toBeNull()
    expect(within(account).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()

    for (const group of ['Profile', 'Notifications', 'Data & privacy']) {
      await user.click(screen.getByText(group, { selector: 'summary' }))
      expect(screen.getByText(group, { selector: 'summary' }).closest('details')).toHaveAttribute('open')
    }
    // Shoes wait under Profile's More; adding Taperday to the home screen sits with Notifications; one data download.
    expect(screen.getByText('More', { selector: 'summary' }).closest('details')).not.toHaveAttribute('open')
    expect(within(account).getByRole('heading', { name: 'Taperday on your home screen' })).toBeInTheDocument()
    expect(within(account).getAllByRole('button', { name: /^Download/ })).toHaveLength(1)
  })

  it('gets a new calendar link from Account, and their plan then offers that one', async () => {
    let resets = 0
    accountApi({ runner: thandi, plans: [current] })
    server.use(
      http.post('*/api/v1/me/calendar/reset', ({ request }) => {
        if (request.headers.get('Authorization') !== `Bearer ${TOKEN}`) return HttpResponse.json({}, { status: 401 })
        resets++
        return HttpResponse.json({ token: newCalendarToken })
      }),
    )
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await openTheirPlan(user)
    await user.click(screen.getByText('Add to calendar'))
    await waitFor(() => expect(screen.getByRole('link', { name: /Apple Calendar/ }).getAttribute('href')).toContain(calendarToken))

    await user.click(screen.getByRole('button', { name: 'Account' }))
    await openDisclosure('Data & privacy')
    const row = (await screen.findByRole('heading', { name: 'Calendar link' })).closest('.section') as HTMLElement
    expect(within(row).getByText(/the old link stops working/)).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Get a new link' }))

    expect(await within(row).findByText('Done. Add your plan to your calendar again from the plan.')).toBeInTheDocument()
    expect(resets).toBe(1)
    window.history.back()
    await screen.findByRole('heading', { name: 'Parkrun PB' }, { timeout: 3000 })
    await user.click(screen.getByText('Add to calendar'))
    expect(screen.getByRole('link', { name: /Apple Calendar/ }).getAttribute('href')).toContain(`/api/v1/calendar/${newCalendarToken}.ics`)
  })

  it('asks before a plan for another race replaces theirs', async () => {
    const db = accountApi({ runner: thandi, plans: [current] })
    window.history.replaceState(null, '', '/?km=10&date=2027-01-10&name=Spring+10K&goal=3000&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08')
    const user = renderWith(signedIn())

    // The plan shows first; the button changes once the current plan has loaded.
    await user.click(await findPlanControl('Make this my plan'))
    expect(screen.getByText('Replace Parkrun PB?')).toBeInTheDocument()
    expect(db.saved).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Yes, replace it' }))

    await waitFor(() => expect(db.saved).toHaveLength(1))
    expect(db.saved[0]).toMatchObject({ replaceCurrent: true })
  })

  it('replans their saved plan in their account, so it opens rebuilt everywhere', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 9, 0))
    accountApi({ runner: thandi, plans: [current] })
    const replans: unknown[] = []
    server.use(
      http.post('*/api/v1/me/plans/:id/replan', async ({ request, params }) => {
        replans.push({ id: params.id, body: await request.json() })
        const replan = { from: '2026-10-21', setback: 'Illness', recentWeeklyKm: null }
        return HttpResponse.json({ id: 'plan-1', name: 'Parkrun PB', createdAt: '2026-10-08T09:00:00Z', inputs: {}, plan: { ...planFixture, replan }, status: 'Active' })
      }),
    )
    window.history.replaceState(null, '', '/')
    const user = renderWith(signedIn())
    await openTheirPlan(user)

    await openRebuild()
    await user.click(screen.getByRole('radio', { name: /I was ill/ }))
    await user.click(screen.getByRole('button', { name: 'Rebuild my plan' }))

    expect(await screen.findByText(/Rebuilt from Wed 21 Oct/)).toBeInTheDocument()
    expect(replans).toEqual([{ id: 'plan-1', body: { replanFrom: '2026-10-21', setback: 'Illness', recentWeeklyKm: null } }])
    expect(window.location.search).toContain('re=2026-10-21&why=ill')
  })

  it('can delete their account after confirming, which signs them out', async () => {
    const auth = signedIn()
    const db = accountApi({ runner: thandi })
    const user = renderWith(auth)
    await user.click(await screen.findByRole('button', { name: 'Account' }))

    await openDisclosure('Data & privacy')
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }))
    expect(db.runner).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Yes, delete everything' }))

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(db.runner).toBeNull()
  })

  it('is told plainly when their sign-in has expired', async () => {
    accountApi({ runner: thandi })
    server.use(http.post('*/api/v1/me/plans', () => HttpResponse.json({}, { status: 401 })))
    window.history.replaceState(null, '', `/${link}`)
    const user = renderWith(signedIn())

    await user.click(await findPlanControl('Save plan'))

    expect(await screen.findByText(/sign-in has expired/)).toBeInTheDocument()
  })
})

describe('signing up, with a little theatre', () => {
  // Motion on, and the starting-gun intro already seen so it doesn't sit over the page.
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    window.sessionStorage.setItem('taperday:intro-seen', '1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  it('lets the runner dash off before going to Microsoft, without waiting long', async () => {
    const auth = signedOut()
    const user = renderWith(auth)

    await user.click(await screen.findByRole('button', { name: 'Sign up free' }))

    expect(screen.getByRole('status')).toHaveTextContent('Taking you to sign up')
    expect(screen.getByRole('button', { name: 'Sign up free' })).toBeDisabled()
    expect(auth.signUp).not.toHaveBeenCalled()
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1), { timeout: 3000 })
  })

  it('puts them on the start list once the profile is saved, then gets out of the way', async () => {
    accountApi({ runner: null })
    const user = renderWith(signedIn())

    const name = await screen.findByLabelText('What should we call you?')
    await user.clear(name)
    await user.type(name, 'Thandi M')
    await user.click(screen.getByRole('checkbox', { name: /I’ve read this/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('You’re on the start list!')
    expect(status).toHaveTextContent('Welcome, Thandi M.')
    // The Strava choice appears underneath without waiting for the celebration to finish.
    expect(screen.getByRole('heading', { name: 'Bring your runs with you.' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('You’re on the start list!')).not.toBeInTheDocument(), { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: "I’ll connect later" }))
    expect(await screen.findByRole('heading', { name: 'Which race?' })).toBeInTheDocument()
  }, 10000)
})

describe('the race bib on the profile step', () => {
  it('prints the name as it’s typed and stamps it official when the privacy notice is accepted', async () => {
    accountApi({ runner: null })
    const user = renderWith(signedIn())
    const bib = () => document.querySelector('.entry-bib')

    const name = await screen.findByLabelText('What should we call you?')
    await user.clear(name)
    expect(bib()).toHaveTextContent('Your name here')
    await user.type(name, 'Thandi M')
    expect(bib()).toHaveTextContent('Thandi M')
    expect(bib()).not.toHaveTextContent('Official')

    await user.click(screen.getByRole('checkbox', { name: /I’ve read this/ }))
    expect(bib()).toHaveTextContent('Official')
  })

  it('only appears while signing up, not when editing an account', async () => {
    accountApi({ runner: thandi })
    window.history.replaceState(null, '', '/?view=account')
    renderWith(signedIn())

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(document.querySelector('.entry-bib')).toBeNull()
  })
})
