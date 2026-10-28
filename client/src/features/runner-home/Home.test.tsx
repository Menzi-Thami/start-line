import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { ActivitySummary, LoggedRun, PersonalBest, Runner, TrainingPlan } from '../../lib/types'
import { server, stravaOff } from '../../test/server'
import type { CurrentPlan } from '../account/useCurrentPlan'
import plan5k from '../../test/fixtures/plan-5k.json'
import { Home } from './Home'

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

const tenK: PersonalBest = { name: '10K', distanceMetres: 10000, seconds: 3258, paceSecondsPerKm: 325.8, localDate: '2026-10-18', activityId: 'nelson' } as PersonalBest

const signedIn = { ...accountsOff, enabled: true, getToken: () => Promise.resolve('token') }

const renderHome = (props: Partial<Parameters<typeof Home>[0]> = {}, { signIn = false } = {}) => {
  const handlers = { onOpenPlan: vi.fn(), onBuildPlan: vi.fn(), onOpenRun: vi.fn(), onOpenAccount: vi.fn() }
  const home = <Home runner={thandi} units="km" today="2026-10-23" current={null} runs={[]} {...handlers} {...props} />
  render(signIn ? <AuthContext.Provider value={signedIn}>{home}</AuthContext.Provider> : home)
  const user = userEvent.setup()
  return { ...handlers, user, openTab: (name: 'Today' | 'Tools') => user.click(screen.getByRole('tab', { name })) }
}

const current = { id: 'plan-1', name: 'Spring 5K', inputs: {} as CurrentPlan['inputs'] }
const withPlan = { current, initialPlan: { id: 'plan-1', plan: plan5k as unknown as TrainingPlan } }

beforeEach(() => window.history.replaceState(null, '', '/?view=home'))

describe('Home', () => {
  it('swipes between views without stealing gestures from calculator controls', async () => {
    renderHome()
    const panel = screen.getByRole('tabpanel', { name: 'Today' })
    fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 80, clientY: 105 }] })
    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true')
    await screen.findByRole('region', { name: 'Calculators' })
    const control = screen.getByRole('button', { name: 'Race times', exact: true })
    fireEvent.touchStart(control, { touches: [{ clientX: 80, clientY: 100 }] })
    fireEvent.touchEnd(control, { changedTouches: [{ clientX: 200, clientY: 105 }] })
    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true')
  })
  it('greets the runner and, without a plan, offers to build one', async () => {
    const { user, onBuildPlan } = renderHome()

    expect(screen.getByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(onBuildPlan).toHaveBeenCalled()
  })

  it('opens on Today with the week and their progress in view, and the calculators a tab away', async () => {
    const { openTab } = renderHome()

    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Your running' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Personal bests' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Calculators' })).not.toBeInTheDocument()

    await openTab('Tools')
    expect(await screen.findByRole('region', { name: 'Calculators' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'This week' })).not.toBeInTheDocument()
  })

  it('lists this week’s runs from the plan, ticking the ones already run', () => {
    renderHome({ ...withPlan, runs: [run('2026-10-20', 6.5)] })

    const week = screen.getByRole('list', { name: 'This week’s runs' })
    const rows = within(week).getAllByRole('listitem').map((row) => row.textContent)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatch(/Fartlek.*6.5 km, done/)
    expect(rows.join(' ')).not.toMatch(/Strength/)
  })

  it('puts the real race date, distance and plan phase in the race card', () => {
    renderHome(withPlan)

    expect(screen.getByText('5 km')).toBeInTheDocument()
    expect(screen.getByText('Week 2 of 9 · Base')).toBeInTheDocument()
  })

  it('opens the current plan from the race countdown without inventing a workout action', async () => {
    const { user, onOpenPlan } = renderHome(withPlan)
    expect(screen.getByRole('region', { name: 'Parkrun PB' })).toHaveTextContent('51days to go')
    await user.click(screen.getByRole('button', { name: 'Open your training plan' }))
    expect(onOpenPlan).toHaveBeenCalledOnce()
  })

  it('leads today’s card with the run and marks it done, with why one tap away', async () => {
    const { user } = renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-20', 6.5)] })

    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('Done')).toBeInTheDocument()
    const why = within(today).getByText('Why this run')
    expect(why.closest('details')).not.toHaveAttribute('open')
    await user.click(why)
    expect(why.closest('details')).toHaveAttribute('open')
  })

  it('keeps the tab in the address, so a shared link or Back opens the same one', async () => {
    const { openTab } = renderHome()

    await openTab('Tools')
    expect(window.location.search).toBe('?view=home&tab=tools')
    await openTab('Today')
    expect(window.location.search).toBe('?view=home')
  })

  it('opens an old Progress link on Today, where progress now is', () => {
    window.history.replaceState(null, '', '/?view=home&tab=progress')
    renderHome()

    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Your running' })).toBeInTheDocument()
  })

  it('opens on the tab the address names', () => {
    window.history.replaceState(null, '', '/?view=home&tab=tools')
    renderHome()

    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Calculators' })).toBeInTheDocument()
  })

  it('moves between tabs with the arrow keys, like any tab list', async () => {
    const { user } = renderHome()

    await user.click(screen.getByRole('tab', { name: 'Today' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows their running this month, this year and week by week, from their uploads and ticked sessions', async () => {
    const log: LoggedRun[] = [
      { date: '2026-10-18', distanceKm: 42.2, source: 'Uploaded' },
      { date: '2026-10-02', distanceKm: 10, source: 'Ticked' },
      { date: '2026-09-05', distanceKm: 12, source: 'Uploaded' },
    ]
    server.use(http.get('*/api/v1/me/running', () => HttpResponse.json(log)))
    renderHome({}, { signIn: true })

    const running = screen.getByRole('region', { name: 'Your running' })
    expect(await within(running).findByText('52.2')).toBeInTheDocument()
    expect(within(running).getByText(/each ticked one at its planned distance/)).toBeInTheDocument()
    expect(within(running).getByText('64.2')).toBeInTheDocument()
    expect(within(running).getByText(/40.2 km \(335%\) more than 1 Sept–23 Sept/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Weekly distance, last 12 weeks' })).toBeInTheDocument()
  })

  it('never counts a Strava run in the kept totals, and says plainly why', async () => {
    renderHome({ runs: [run('2026-10-21', 8, 'Strava')] }, { signIn: true })

    const running = screen.getByRole('region', { name: 'Your running' })
    expect(await within(running).findByText(/they count here once you tick their session/)).toBeInTheDocument()
    expect(within(running).queryByText('8')).not.toBeInTheDocument()
    expect(within(running).getAllByText('0').length).toBeGreaterThan(0)
  })

  it('offers "Ran this? Tick it" on today’s session when Strava has a run for it, and ticks it as a plain done', async () => {
    const saved = { id: 'plan-1', name: 'Spring 5K', plan: plan5k, coaching: [] }
    const puts: { url: string; body: unknown }[] = []
    server.use(
      http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json(saved)),
      http.put('*/api/v1/me/plans/:id/check-ins/:date/:type', async ({ request }) => {
        const body = (await request.json()) as { status: string; effort: number | null }
        puts.push({ url: new URL(request.url).pathname, body })
        return HttpResponse.json({ date: '2026-10-20', sessionType: 'Fartlek', status: body.status, effort: body.effort, pain: 'None', painArea: null, distanceKm: null, duration: null, note: null, updatedAt: '2026-10-20T08:00:00Z' })
      }),
    )
    const { user } = renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-20', 6.8, 'Strava', 'Fartlek')] }, { signIn: true })

    const todayCard = screen.getByRole('region', { name: 'Today' })
    const tick = await within(todayCard).findByRole('button', { name: 'Ran this? Tick it' })
    // Strava's run alone doesn't make it done: that's the runner's tick.
    expect(todayCard.querySelector('.home-done-chip')).toBeNull()
    await user.click(tick)

    expect(puts).toEqual([{ url: '/api/v1/me/plans/plan-1/check-ins/2026-10-20/Fartlek', body: { status: 'Done', effort: null } }])
    expect(await within(todayCard).findByRole('button', { name: 'Add how Fartlek felt' })).toBeInTheDocument()
    expect(todayCard.querySelector('.home-done-chip')).toHaveTextContent('Done')
    expect(within(todayCard).queryByRole('button', { name: 'Ran this? Tick it' })).not.toBeInTheDocument()
  })

  it('never offers the tick for an uploaded run, or before the check-ins have loaded', async () => {
    server.use(http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json({ id: 'plan-1', name: 'Spring 5K', plan: plan5k, coaching: [] })))
    renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-20', 6.8, 'Upload', 'Fartlek')] })

    expect(await within(screen.getByRole('region', { name: 'Today' })).findByText('Fartlek')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ran this? Tick it' })).not.toBeInTheDocument()
  })

  it('opens from a "ran it?" notification on that session, ready to tick', async () => {
    window.history.replaceState(null, '', '/?view=home&tick=2026-10-18.LongRun')
    server.use(http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json({ id: 'plan-1', name: 'Spring 5K', plan: plan5k, coaching: [] })))
    renderHome({ ...withPlan, today: '2026-10-20', runs: [run('2026-10-18', 6.2, 'Strava', 'LongRun')] }, { signIn: true })

    const card = await screen.findByRole('region', { name: 'Sunday’s Long run' })
    expect(within(card).getByRole('button', { name: 'Ran this? Tick it' })).toBeInTheDocument()
  })

  it('shows personal bests, each opening the run it came from', async () => {
    const { user, onOpenRun } = renderHome({ bests: [tenK] })

    const bests = screen.getByRole('region', { name: 'Personal bests' })
    expect(within(bests).getByText('54:18')).toBeInTheDocument()
    await user.click(within(bests).getByRole('button', { name: '18 Oct' }))
    expect(onOpenRun).toHaveBeenCalledWith('nelson')
  })

  it('nudges once to connect Strava when it could send runs, and says nothing when it does', async () => {
    const { user, onOpenAccount } = renderHome({ strava: { ...stravaOff, available: true } })

    await user.click(screen.getByRole('button', { name: 'Connect Strava' }))
    expect(onOpenAccount).toHaveBeenCalled()
  })

  it('leaves Strava out of Home once it’s connected, or when it isn’t on offer', () => {
    renderHome({ strava: { ...stravaOff, available: true, connected: true, status: 'Active' } })
    expect(screen.queryByText(/Strava/)).not.toBeInTheDocument()
  })
})

describe('the calculators', () => {
  it('turns a distance and a time into a pace, and a pace into a finish time', async () => {
    const { user, openTab } = renderHome()
    await openTab('Tools')
    const calculators = screen.getByRole('region', { name: 'Calculators' })

    const time = within(calculators).getByRole('group', { name: 'Your time' })
    const pace = within(calculators).getByRole('group', { name: 'Or a pace (per km)' })
    await user.type(within(time).getByLabelText('Minutes'), '50')
    expect(within(calculators).getByText('5:00/km')).toBeInTheDocument()

    await user.type(within(pace).getByLabelText('Minutes'), '6')
    expect(within(calculators).getByText('1:00:00')).toBeInTheDocument()
  })

  it('predicts race times from a recent race', async () => {
    const { user, openTab } = renderHome()
    await openTab('Tools')
    await user.click(screen.getByRole('button', { name: 'Race times' }))

    await user.type(screen.getByLabelText('Minutes'), '24')
    await user.click(screen.getByRole('button', { name: 'Predict my race times' }))

    const table = await within(screen.getByRole('region', { name: 'Calculators' })).findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(5)
  })

  it('lists heart-rate zones from the runner’s own maximum', async () => {
    const { user, openTab } = renderHome()
    await openTab('Tools')
    await user.click(screen.getByRole('button', { name: 'Heart rate' }))

    expect(screen.getByLabelText('Your maximum heart rate (bpm)')).toHaveValue('190')
    expect(screen.getByText('Zone 2: Easy')).toBeInTheDocument()
    expect(screen.getByText('114–133 bpm')).toBeInTheDocument()
  })

  it('splits a goal by the kilometre, and says what to eat for a long race', async () => {
    const { user, openTab } = renderHome()
    await openTab('Tools')
    await user.click(screen.getByRole('button', { name: 'Splits' }))
    await user.type(screen.getByLabelText('Minutes'), '50')
    const splitRows = within(within(screen.getByRole('region', { name: 'Calculators' })).getByRole('table')).getAllByRole('row').slice(1)
    expect(splitRows).toHaveLength(10)
    expect(splitRows.every((row) => within(row).getAllByRole('cell')[0]!.textContent === '5:00')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Fuelling' }))
    await user.type(screen.getByLabelText('Hours'), '4')
    expect(screen.getByText(/60–90 g/)).toBeInTheDocument()
  })
})
