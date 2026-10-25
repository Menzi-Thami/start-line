import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { ActivitySummary, CheckIn, CoachNote, Runner, SavedPlan } from '../../lib/types'
import { planFixture, server } from '../../test/server'
import { Home } from './Home'
import { YourWeek } from './YourWeek'

const run = (localDate: string, distanceKm: number): ActivitySummary =>
  ({
    id: localDate,
    startedAt: `${localDate}T06:00:00Z`,
    localDate,
    kind: 'Run',
    distanceKm,
    movingSeconds: distanceKm * 360,
    paceSecondsPerKm: 360,
    plannedTitle: null,
    plannedSessionType: null,
    pace: null,
    averageHeartRate: null,
    source: { kind: 'Strava', viewUrl: null },
  }) as unknown as ActivitySummary

const harderWeek: CoachNote = {
  weekStart: '2026-10-19',
  verdict: 'Struggling',
  holdVolume: true,
  doseStep: 0,
  cutbackNow: false,
  reasons: ['FeltHarderThanPlanned'],
  paceFactor: 1,
}

const week2 = planFixture.weeks[1]!

describe('Your week', () => {
  it('leads with the coach’s call, then last week and this week', () => {
    // Tuesday 20 October, week 2. Last week: hills, easy + strides and the long run, the Saturday easy run missed.
    render(
      <YourWeek
        plan={planFixture}
        week={week2}
        coachNotes={[harderWeek]}
        today="2026-10-20"
        units="km"
        runs={[run('2026-10-13', 5.5), run('2026-10-15', 3), run('2026-10-18', 6.2)]}
      />,
    )

    const panel = screen.getByRole('region', { name: 'Your week' })
    expect(within(panel).getByRole('region', { name: 'Coach’s note' })).toHaveTextContent('An easier week')
    expect(within(panel).getByText('This week stays at last week’s distance.')).toBeInTheDocument()

    const last = within(panel).getByRole('region', { name: 'Last week' })
    expect(last).toHaveTextContent('3 of 4 runs done')
    expect(last).toHaveTextContent('14.7 km of 17.5 km planned')
    expect(last).toHaveTextContent('Long run: 6.2 km of 6 km')
    expect(last).toHaveTextContent('Missed: Easy run, Saturday 17 October.')

    const now = within(panel).getByRole('region', { name: 'This week · week 2 of 9' })
    expect(now).toHaveTextContent('23.5 km planned')
    expect(now).toHaveTextContent('▲ 6 km more than last week')
    expect(now).toHaveTextContent('Key sessions: Fartlek (Tue), Progression run (Thu)')
    expect(now).toHaveTextContent('Long run: 6.5 km on Sun')
  })

  it('says how the hard sessions felt once the runner checks in, and asks them to when they haven’t', () => {
    const hills: CheckIn = { date: '2026-10-13', sessionType: 'Hills', status: 'Done', effort: 9, pain: 'None', painArea: null, distanceKm: null, duration: null, note: null, updatedAt: '2026-10-13T08:00:00Z' }
    const props = { plan: planFixture, week: week2, coachNotes: [], today: '2026-10-20', units: 'km' as const, runs: [run('2026-10-13', 5.5)] }

    const { unmount } = render(<YourWeek {...props} />)
    expect(screen.getByText(/Check in after your runs/)).toBeInTheDocument()
    unmount()

    render(<YourWeek {...props} checkInFor={(s) => (s.date === hills.date && s.type === hills.sessionType ? hills : undefined)} />)
    expect(screen.getByText('Hard sessions felt harder than they should.')).toBeInTheDocument()
    expect(screen.queryByText(/Check in after your runs/)).not.toBeInTheDocument()
  })

  it('in the first week there’s nothing to look back on yet', () => {
    render(<YourWeek plan={planFixture} week={planFixture.weeks[0]!} coachNotes={[]} today="2026-10-13" units="km" runs={[]} />)

    expect(screen.getByText(/Nothing to look back on yet/)).toBeInTheDocument()
    expect(screen.queryByText(/more than last week/)).not.toBeInTheDocument()
  })
})

describe('Home with a plan', () => {
  const thandi = { id: 'runner-1', displayName: 'Thandi', maxHeartRate: 190 } as Runner
  const current = { id: 'plan-1', name: 'Parkrun PB', inputs: {} as SavedPlan['inputs'] }
  const saved = { id: 'plan-1', name: 'Parkrun PB', plan: planFixture, coaching: [harderWeek] } as unknown as SavedPlan
  const signedIn = { ...accountsOff, enabled: true, getToken: () => Promise.resolve('token') }

  const renderHome = (today: string) => {
    server.use(http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json(saved)))
    const handlers = { onOpenPlan: vi.fn(), onBuildPlan: vi.fn(), onOpenRun: vi.fn(), onOpenAccount: vi.fn() }
    render(
      <AuthContext.Provider value={signedIn}>
        <Home runner={thandi} units="km" today={today} current={current} runs={[]} {...handlers} />
      </AuthContext.Provider>,
    )
  }

  it('Today shows the whole session: distance, pace, the steps to run and why', async () => {
    // Tuesday 20 October: the fartlek.
    renderHome('2026-10-20')

    const todayCard = await screen.findByRole('region', { name: 'Today' })
    expect(await within(todayCard).findByText('Fartlek')).toBeInTheDocument()
    expect(todayCard).toHaveTextContent('6.5 km')
    expect(todayCard).toHaveTextContent('Why: Speed play: practise changing gears by feel')
  })

  it('shows the week on Today, with the coach’s call from the coached plan', async () => {
    renderHome('2026-10-20')

    const panel = await screen.findByRole('region', { name: 'Your week' })
    expect(within(panel).getByRole('region', { name: 'Coach’s note' })).toHaveTextContent('An easier week')
  })

  it('race day keeps its own card and leaves the week out', async () => {
    renderHome('2026-12-13')

    expect(await screen.findByText(/Race day\. Everything you’ve run was for this/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your week' })).not.toBeInTheDocument()
  })
})
