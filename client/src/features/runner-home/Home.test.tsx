import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { ActivitySummary, CheckIn, Runner, SyncedCompletion, TrainingPlan } from '../../lib/types'
import { server, stravaOff } from '../../test/server'
import type { CurrentPlan } from '../account/useCurrentPlan'
import plan5k from '../../test/fixtures/plan-5k.json'
import { Home } from './Home'
import { journeyOf } from '../journey/journey-fixtures'
import type { JourneyActions } from '../journey/useJourney'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear() })

const thandi = { id: 'runner-1', displayName: 'Thandi', maxHeartRate: 190 } as Runner

const run = (localDate: string, distanceKm: number, source: 'Upload' | 'Strava' = 'Upload', plannedSessionType: string | null = null): ActivitySummary =>
  ({
    id: `${localDate}`,
    startedAt: `${localDate}T06:00:00Z`,
    localDate,
    kind: 'Run',
    distanceKm,
    movingSeconds: distanceKm * 360,
    paceSecondsPerKm: 360,
    plannedTitle: null,
    plannedSessionType,
    pace: null,
    averageHeartRate: null,
    source: { kind: source, viewUrl: null },
  }) as unknown as ActivitySummary

const completion = (date: string, sessionType: string, overrides: Partial<SyncedCompletion> = {}): SyncedCompletion =>
  ({ date, sessionType, activityId: date, state: 'Completed', measure: 'Distance', plannedKm: 6.5, actualKm: 4.1, plannedSeconds: 0, actualSeconds: 1476, feedback: 'Shorter', cachedUntil: '2027-01-01T00:00:00Z', ...overrides }) as SyncedCompletion


const signedIn = { ...accountsOff, enabled: true, getToken: () => Promise.resolve('token') }

const renderHome = (props: Partial<Parameters<typeof Home>[0]> = {}, { signIn = false } = {}) => {
  const handlers = { onOpenPlan: vi.fn(), onBuildPlan: vi.fn(), onOpenRun: vi.fn(), onOpenRuns: vi.fn(), onOpenAccount: vi.fn() }
  const home = <Home runner={thandi} units="km" today="2026-10-23" current={null} runs={[]}
    journey={{ state: { kind: 'ready', journey: journeyOf([]), refreshFailed: false }, actions: {} as JourneyActions }} {...handlers} {...props} />
  render(signIn ? <AuthContext.Provider value={signedIn}>{home}</AuthContext.Provider> : home)
  const user = userEvent.setup()
  return { ...handlers, user }
}

const current = { id: 'plan-1', name: 'Spring 5K', inputs: {} as CurrentPlan['inputs'] }
const withPlan = { current, initialPlan: { id: 'plan-1', plan: plan5k as unknown as TrainingPlan } }

beforeEach(() => {
  window.history.replaceState(null, '', '/?view=home')
  server.use(http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json({ id: current.id, plan: plan5k, coaching: [] })))
})

describe('Home', () => {
  it('shows strength-only training separately from running and never completes it from an uploaded run', () => {
    renderHome({ ...withPlan, today: '2026-10-19', runs: [run('2026-10-19', 5)] })
    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('No run today')).toBeInTheDocument()
    expect(within(today).queryByText('Rest day')).toBeNull()
    // Strength is its own card after Today, not part of it, and it's today's session, not "Next".
    expect(within(today).queryByText('Strength & mobility')).toBeNull()
    const strength = screen.getByRole('region', { name: 'Strength today' })
    expect(strength).toHaveTextContent('Strength & mobility')
    expect(strength).toHaveTextContent(/\d+ exercises/)
    expect(strength).not.toHaveTextContent('after your run')
    expect(within(strength).getByRole('button', { name: 'Open strength workout' })).toBeInTheDocument()
    expect(within(strength).queryByText('Target pace')).toBeNull()
    expect(within(strength).queryByText('Distance')).toBeNull()
    expect(within(strength).queryByText('Done')).toBeNull()
  })

  it('puts strength on a run day in its own card after the run, as today and not coming up', () => {
    const source = plan5k as unknown as TrainingPlan
    const lift = source.weeks.flatMap(week => week.sessions).find(session => session.type === 'Strength')!
    const plan = { ...source, weeks: source.weeks.map(week => ({ ...week, sessions: week.sessions.flatMap(session => session.date === '2026-10-20' ? [session, { ...lift, date: '2026-10-20' }] : session.type === 'Strength' ? [] : [session]) })) }
    renderHome({ current, initialPlan: { id: 'plan-1', plan }, today: '2026-10-20' })
    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('Fartlek')).toBeInTheDocument()
    expect(within(today).queryByText(lift.title)).toBeNull()
    const strength = screen.getByRole('region', { name: 'Strength today' })
    expect(strength).toHaveTextContent('Strength today · after your run')
    expect(strength).toHaveTextContent('6 exercises · about 30 min')
  })

  it('recovers a failed plan request without keeping a loading skeleton on screen', async () => {
    let failed = true
    server.use(http.post('*/api/v1/me/plans/:id/coach', () => failed ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ id: 'plan-1', plan: plan5k, coaching: [] })))
    const { user } = renderHome({ current, today: '2026-10-20' }, { signIn: true })
    await screen.findByRole('button', { name: 'Retry plan' })
    expect(screen.queryByRole('status', { name: "Loading today’s session" })).toBeNull()
    failed = false
    await user.click(screen.getByRole('button', { name: 'Retry plan' }))
    const today = screen.getByRole('region', { name: 'Today' })
    expect(await within(today).findByText('Fartlek')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry plan' })).toBeNull()
  })

  it('keeps a saved plan usable and labels it when the refresh fails', async () => {
    server.use(http.post('*/api/v1/me/plans/:id/coach', () => new HttpResponse(null, { status: 503 })))
    renderHome({ ...withPlan, today: '2026-10-20' }, { signIn: true })
    await screen.findByRole('button', { name: 'Retry plan' })
    expect(screen.getByText(/Showing the last plan loaded on this device/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Fartlek')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open your plan' })).toBeInTheDocument()
  })
  it('puts today before the compact weekly preview and keeps the prescription identifiable', () => {
    renderHome({ ...withPlan, today: '2026-10-20' })
    const today = screen.getByRole('region', { name: 'Today' })
    const week = screen.getByRole('region', { name: 'This week' })
    expect(today.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(today).getByText('Distance')).toBeInTheDocument()
    expect(within(today).getByText('Target pace')).toBeInTheDocument()
    expect(within(today).getByRole('heading', { name: 'Fartlek' })).toBeInTheDocument()
    expect(within(today).queryByRole('textbox')).not.toBeInTheDocument()
  })



  it('keeps touch gestures on the current screen, with no tools on Home', () => {
    renderHome()
    const home = document.querySelector('.home-focus')!
    fireEvent.touchStart(home, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(home, { changedTouches: [{ clientX: 80, clientY: 105 }] })
    expect(screen.queryByRole('region', { name: 'Calculators' })).not.toBeInTheDocument()
  })
  it('greets the runner and, without a plan, offers to build one', async () => {
    const { user, onBuildPlan } = renderHome()

    expect(screen.getByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose my next challenge' }))
    expect(onBuildPlan).toHaveBeenCalled()
  })

  it('keeps an empty Home free of progress targets, totals and tools', () => {
    renderHome()
    expect(screen.queryByRole('tablist', { name: 'Home' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'This week' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your running' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Calculators' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back to (Home|Runs)/ })).not.toBeInTheDocument()
  })


  it('summarises the week without repeating the plan agenda on Home', () => {
    renderHome({ ...withPlan, runs: [run('2026-10-20', 6.5)] })
    expect(screen.getByRole('region', { name: 'This week' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'This week’s runs' })).not.toBeInTheDocument()
  })
  it('keeps real race context in the quiet week preview', () => {
    renderHome(withPlan)
    const week = screen.getByRole('region', { name: 'This week' })
    expect(week).toHaveTextContent('5 km')
    expect(week).toHaveTextContent('Week 2 of 9')
    expect(week).toHaveTextContent('Base')
    expect(week).toHaveTextContent('13 Dec')
  })

  it('opens the current week from its compact preview', async () => {
    const { user, onOpenPlan } = renderHome(withPlan)
    await user.click(screen.getByRole('button', { name: 'View this week' }))
    expect(onOpenPlan).toHaveBeenCalledOnce()
  })

  it('opens a uniquely matched upload and leaves durable confirmation separate', async () => {
    const { user, onOpenRun } = renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-20', 6.5, 'Upload', 'Fartlek')] })
    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByRole('heading', { name: '6.5 km' })).toBeInTheDocument()
    expect(within(today).getByText('From your upload')).toBeInTheDocument()
    expect(within(today).queryByText('Done')).not.toBeInTheDocument()
    await user.click(within(today).getByRole('button', { name: 'Open run details' }))
    expect(onOpenRun).toHaveBeenCalledWith('2026-10-20')
  })


  it('keeps an old Progress address on the stable Home without an empty dashboard', () => {
    window.history.replaceState(null, '', '/?view=home&tab=progress')
    renderHome()
    expect(screen.queryByRole('tablist', { name: 'Home' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back, Thandi' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose my next challenge' })).toBeVisible()
  })




  it('offers quick completion on today’s session and can use a linked Strava run', async () => {
    const saved = { id: 'plan-1', name: 'Spring 5K', plan: plan5k, coaching: [] }
    const puts: { url: string; body: unknown }[] = []
    server.use(
      http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json(saved)),
      http.put('*/api/v1/me/plans/:id/check-ins/:date/:type', async ({ request }) => {
        const body = (await request.json()) as { status: string; effort: number | null; activityId?: string; distanceUnreported: boolean }
        puts.push({ url: new URL(request.url).pathname, body })
        return HttpResponse.json({ date: '2026-10-20', sessionType: 'Fartlek', status: body.status, effort: body.effort, pain: 'None', painArea: null, distanceKm: null, duration: null, note: null, updatedAt: '2026-10-20T08:00:00Z', activityId: body.activityId, distanceUnreported: body.distanceUnreported, isAdditional: false })
      }),
    )
    const { user } = renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-20', 6.8, 'Strava', 'Fartlek')] }, { signIn: true })

    const todayCard = screen.getByRole('region', { name: 'Today' })
    await user.click(await within(todayCard).findByRole('button', { name: 'Log a run manually' }))
    const tick = await within(todayCard).findByRole('button', { name: 'Log this workout' })
    // Strava's run alone doesn't make it done: that's the runner's tick.
    expect(todayCard.querySelector('.home-done-chip')).toBeNull()
    await user.click(tick)

    await user.selectOptions(within(todayCard).getByLabelText('Run details'), '2026-10-20')
    await user.click(within(todayCard).getByRole('button', { name: 'Save check-in' }))
    expect(puts).toEqual([{ url: '/api/v1/me/plans/plan-1/check-ins/2026-10-20/Fartlek', body: expect.objectContaining({ status: 'Done', effort: null, activityId: '2026-10-20', distanceUnreported: true }) }])
    expect(await within(todayCard).findByRole('button', { name: 'Change how Fartlek went' })).toBeInTheDocument()
    expect(todayCard.querySelector('.home-done-chip')).toHaveTextContent('Done')
    expect(within(todayCard).queryByRole('button', { name: 'Keep this tick' })).not.toBeInTheDocument()
  })

  it('never shows a Strava completion for an uploaded run, or before the check-ins have loaded', async () => {
    server.use(http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json({ id: 'plan-1', name: 'Spring 5K', plan: plan5k, coaching: [] })))
    renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-20', 6.8, 'Upload', 'Fartlek')] })

    expect(await within(screen.getByRole('region', { name: 'Today' })).findByText('From your upload')).toBeInTheDocument()
    expect(screen.queryByText('Completed via Strava')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keep this tick' })).not.toBeInTheDocument()
  })

  it('opens from a "ran it?" notification on that session, completed via Strava and ready to keep', async () => {
    window.history.replaceState(null, '', '/?view=home&tick=2026-10-18.LongRun')
    server.use(
      http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json({ id: 'plan-1', name: 'Spring 5K', plan: plan5k, coaching: [] })),
      http.get('*/api/v1/me/plans/:id/strava-completions', () => HttpResponse.json([completion('2026-10-18', 'LongRun', { plannedKm: 6, actualKm: 6.2, feedback: 'Near' })])),
    )
    renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-18', 6.2, 'Strava', 'LongRun')] }, { signIn: true })

    const card = await screen.findByRole('region', { name: 'Sunday’s Long run' })
    expect(within(card).getByText('Completed via Strava')).toBeInTheDocument()
    expect(within(card).getByText('Run recorded. Nice work showing up today.')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Keep this tick' })).toBeInTheDocument()
  })


  it('keeps ordinary connection setup off Home and exposes an actual reconnect problem', () => {
    const { onOpenAccount } = renderHome({ strava: { ...stravaOff, available: true, connected: true, status: 'NeedsReconnect' } })
    expect(screen.queryByRole('button', { name: 'Connect Strava' })).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'Reconnect Strava' }).click()
    expect(onOpenAccount).toHaveBeenCalledOnce()
  })

  it('does not offer a connection nudge once Strava is connected', () => {
    renderHome({ strava: { ...stravaOff, available: true, connected: true, status: 'Active' } })
    expect(screen.queryByRole('button', { name: /Connect Strava/i })).not.toBeInTheDocument()
  })
})





it('does not claim an unconfirmed Strava run completed today’s workout while saved runs load', () => {
  renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-20', 10, 'Strava')] }, { signIn: true })
  const today = screen.getByRole('region', { name: 'Today' })
  expect(within(today).queryByText('Done', { exact: true })).not.toBeInTheDocument()
})




describe('Completed via Strava', () => {
  const coached = () => http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json({ id: 'plan-1', name: 'Spring 5K', plan: plan5k, coaching: [] }))
  const checkIn = (date: string, sessionType: string, status: string): CheckIn =>
    ({ date, sessionType, status, effort: null, pain: 'None', painArea: null, distanceKm: null, duration: null, note: null, updatedAt: '2026-10-20T08:00:00Z', activityId: null, distanceUnreported: false, isAdditional: false }) as unknown as CheckIn
  const saving = (puts: unknown[]) => http.put('*/api/v1/me/plans/:id/check-ins/:date/:type', async ({ request }) => {
    const body = (await request.json()) as { status: string }
    puts.push(body)
    return HttpResponse.json({ ...checkIn('2026-10-20', 'Fartlek', body.status), ...body })
  })
  const stravaRun = [run('2026-10-20', 4.1, 'Strava', 'Fartlek')]

  it('shows today’s Strava run on Home without ticking it; the full log and a plain tick are under More details', async () => {
    const puts: unknown[] = []
    server.use(coached(), saving(puts), http.get('*/api/v1/me/plans/:id/strava-completions', () => HttpResponse.json([completion('2026-10-20', 'Fartlek')])))
    const { user } = renderHome({ ...withPlan, today: '2026-10-20', runs: stravaRun }, { signIn: true })

    const todayCard = screen.getByRole('region', { name: 'Today' })
    // UX02: the run shows without any tap; nothing is saved until the runner answers.
    expect(await within(todayCard).findByText('Imported from Strava')).toBeInTheDocument()
    expect(await within(todayCard).findByRole('group', { name: 'How hard did it feel?' })).toBeInTheDocument()
    expect(todayCard.querySelector('.home-done-chip')).toBeNull()
    expect(puts).toEqual([])

    // More details: the full run log (one way in) and the tick without a rating.
    await user.click(within(todayCard).getByText('More details'))
    await user.click(within(todayCard).getByRole('button', { name: 'Add your own distance and time' }))
    expect(within(todayCard).getByRole('button', { name: 'Log this workout' })).toBeInTheDocument()
    await user.click(within(todayCard).getByRole('button', { name: 'Tick without rating' }))
    expect(puts).toEqual([{ status: 'Done', effort: null, distanceUnreported: false }])
    expect(await within(todayCard).findByText('Done, not rated')).toBeInTheDocument()
    expect(todayCard.querySelector('.home-done-chip')).toHaveTextContent('Done')
  })

  // R02 on Home: rate today's Strava run in two taps; only the runner's own answer is saved, and it shows in place.
  it('offers the two-tap rating straight on Home when a Strava run did today’s session, and keeps only the runner’s answer', async () => {
    localStorage.removeItem('taperday.tick-prompt.dismissed.2026-10-20')
    const puts: unknown[] = []
    server.use(coached(), saving(puts), http.get('*/api/v1/me/plans/:id/strava-completions', () => HttpResponse.json([completion('2026-10-20', 'Fartlek')])))
    const { user } = renderHome({ ...withPlan, today: '2026-10-20', runs: stravaRun }, { signIn: true })

    const prompt = await screen.findByRole('region', { name: 'Rate today’s run' })
    expect(within(prompt).getByText('You ran today. Nice work.')).toBeInTheDocument()
    // Clean: the rating and its two taps, no second copy of the run's figures, one way into the full log.
    expect(within(prompt).queryByText('Completed via Strava')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Log a run manually' })).not.toBeInTheDocument()
    expect(puts).toEqual([])
    await user.click(within(prompt).getByRole('radio', { name: '6, Working' }))
    await user.click(within(prompt).getByRole('button', { name: 'Save as planned' }))
    expect(puts).toEqual([{ status: 'Done', effort: 6, pain: 'None', painArea: null, distanceKm: null, duration: null, activityId: null, note: null, actualSessionType: null, distanceUnreported: false }])
    expect(await within(prompt).findByText('Rated 6/10 · As planned')).toBeInTheDocument()
    expect(within(prompt).getByRole('button', { name: 'Edit feedback for Fartlek' })).toBeInTheDocument()
  })

  it('lets the runner say Not now, and remembers it for the day on this device', async () => {
    localStorage.removeItem('taperday.tick-prompt.dismissed.2026-10-20')
    server.use(coached(), http.get('*/api/v1/me/plans/:id/strava-completions', () => HttpResponse.json([completion('2026-10-20', 'Fartlek')])))
    const first = renderHome({ ...withPlan, today: '2026-10-20', runs: stravaRun }, { signIn: true })

    const prompt = await screen.findByRole('region', { name: 'Rate today’s run' })
    await first.user.click(within(prompt).getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('region', { name: 'Rate today’s run' })).not.toBeInTheDocument()
    // R10: saying Not now saves nothing and leaves the Strava completion and the run itself in place.
    expect(screen.getByRole('region', { name: 'Today' })).toHaveTextContent('Imported from Strava')
    expect(localStorage.getItem('taperday.tick-prompt.dismissed.2026-10-20')).toBe('1')
    localStorage.removeItem('taperday.tick-prompt.dismissed.2026-10-20')
  })

  it('counts a session done via Strava in this week’s runs', async () => {
    server.use(coached(), http.get('*/api/v1/me/plans/:id/strava-completions', () => HttpResponse.json([completion('2026-10-20', 'Fartlek')])))
    renderHome({ ...withPlan, today: '2026-10-20', runs: stravaRun }, { signIn: true })

    const week = screen.getByRole('region', { name: 'This week' })
    expect(await within(week).findByText(/1 of 4 runs/)).toBeInTheDocument()
  })

  it('keeps the runner’s skip and shows the matching run as a conflict, with one tap to change their answer', async () => {
    const puts: unknown[] = []
    server.use(
      coached(),
      saving(puts),
      http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json([checkIn('2026-10-20', 'Fartlek', 'Skipped')])),
      http.get('*/api/v1/me/plans/:id/strava-completions', () => HttpResponse.json([completion('2026-10-20', 'Fartlek', { state: 'Conflict' })])),
    )
    const { user } = renderHome({ ...withPlan, today: '2026-10-20', runs: stravaRun }, { signIn: true })

    const todayCard = screen.getByRole('region', { name: 'Today' })
    await userEvent.click(await within(todayCard).findByRole('button', { name: /Log a run manually|Edit run log/ }))
    expect(await within(todayCard).findByText('You marked this skipped.')).toBeInTheDocument()
    expect(within(todayCard).getByText(/Strava has a 4\.1 km run on this day/)).toBeInTheDocument()
    expect(todayCard.querySelector('.home-done-chip')).toBeNull()
    expect(within(todayCard).queryByText('Completed via Strava')).not.toBeInTheDocument()

    await user.click(within(todayCard).getByRole('button', { name: 'I ran it: mark as done' }))
    expect(puts).toEqual([{ status: 'Done', effort: null, distanceUnreported: false }])
    await vi.waitFor(() => expect(todayCard.querySelector('.home-done-chip')).toHaveTextContent('Done'))
    expect(within(todayCard).queryByText('You marked this skipped.')).not.toBeInTheDocument()
  })

  it('says why a tick didn’t save and leaves the Strava completion as it was', async () => {
    server.use(
      coached(),
      http.get('*/api/v1/me/plans/:id/strava-completions', () => HttpResponse.json([completion('2026-10-20', 'Fartlek')])),
      http.put('*/api/v1/me/plans/:id/check-ins/:date/:type', () => HttpResponse.json({ title: 'Try again' }, { status: 500 })),
    )
    const { user } = renderHome({ ...withPlan, today: '2026-10-20', runs: stravaRun }, { signIn: true })

    const todayCard = screen.getByRole('region', { name: 'Today' })
    await user.click(await within(todayCard).findByRole('radio', { name: '4, Comfortable' }))
    await user.click(within(todayCard).getByRole('button', { name: 'Save as planned' }))
    expect(await within(todayCard).findByRole('alert')).toBeInTheDocument()
    // Nothing saved, so the run still shows as imported from Strava.
    expect(within(todayCard).getByText('Imported from Strava')).toBeInTheDocument()
    // The choice is kept, so trying again is one tap.
    expect(within(todayCard).getByRole('radio', { name: '4, Comfortable' })).toBeChecked()
    expect(within(todayCard).getByRole('button', { name: 'Save as planned' })).toBeEnabled()
  })

  it('stops showing the session done the moment the Strava copy lapses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.setSystemTime(new Date('2026-10-20T06:00:00Z'))
      let reads = 0
      server.use(
        coached(),
        http.get('*/api/v1/me/plans/:id/strava-completions', () =>
          HttpResponse.json(++reads === 1 ? [completion('2026-10-20', 'Fartlek', { cachedUntil: '2026-10-20T06:01:00Z' })] : [])),
      )
      renderHome({ ...withPlan, today: '2026-10-20', runs: stravaRun }, { signIn: true })
      const todayCard = screen.getByRole('region', { name: 'Today' })
      await vi.waitFor(() => expect(within(todayCard).getByRole('heading', { name: '4.1 km' })).toBeInTheDocument())
      expect(within(todayCard).getByText('Imported from Strava')).toBeInTheDocument()

      await act(async () => { await vi.advanceTimersByTimeAsync(60_100) })

      await vi.waitFor(() => expect(within(todayCard).getByRole('heading', { name: 'Fartlek' })).toBeInTheDocument())
      expect(todayCard.querySelector('.home-done-chip')).toBeNull()
      expect(reads).toBeGreaterThanOrEqual(2)
    } finally { vi.useRealTimers() }
  })

  it('shows nothing via Strava when the completions can’t be read', async () => {
    server.use(coached(), http.get('*/api/v1/me/plans/:id/strava-completions', () => HttpResponse.json({ title: 'Down' }, { status: 503 })))
    renderHome({ ...withPlan, today: '2026-10-20', runs: stravaRun }, { signIn: true })

    const todayCard = screen.getByRole('region', { name: 'Today' })
    await userEvent.click(await within(todayCard).findByRole('button', { name: 'Log a run manually' }))
    expect(await within(todayCard).findByRole('button', { name: 'Log this workout' })).toBeInTheDocument()
    expect(within(todayCard).queryByText('Completed via Strava')).not.toBeInTheDocument()
    expect(todayCard.querySelector('.home-done-chip')).toBeNull()
  })
})

it('keeps race preparation reachable from today without a second focus card', async () => {
  const onOpenRacePrep = vi.fn()
  const { user } = renderHome({ ...withPlan, today: '2026-12-09', onOpenRacePrep })
  const today = screen.getByRole('region', { name: 'Today' })
  expect(today).toHaveTextContent('4 days to Parkrun PB')
  await user.click(within(today).getByRole('button', { name: 'Race-day checklist and pacing' }))
  expect(onOpenRacePrep).toHaveBeenCalledOnce()
  expect(document.querySelectorAll('.home-focus .button-primary')).toHaveLength(1)
})

it('keeps race week off Home until the last seven days', () => {
  renderHome({ ...withPlan, today: '2026-10-20' })
  expect(screen.queryByText('Race week')).not.toBeInTheDocument()
})
