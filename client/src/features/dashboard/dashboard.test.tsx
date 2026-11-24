import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { runsByDate } from '../../lib/plan-runs'
import type { ActivitySummary, PersonalBest, SessionType, TrainingPlan } from '../../lib/types'
import plan5k from '../../test/fixtures/plan-5k.json'
import { FROM_STRAVA, UPLOADED } from '../../test/sources'
import { PlanView } from '../plan/PlanView'
import { adherence, easyTrend, missedKeySession, mondayOf, verdictChip, weekSoFar } from './dashboard-math'

// Week 1 of the 5K plan (from Monday 12 October): strength Mon, hills Tue 5.5 km, easy + strides Thu 3 km,
// easy Sat 3 km, long run Sun 6 km. Week 2: fartlek Tue, progression Thu, easy Sat, long run Sun.
const plan = plan5k as TrainingPlan
const week1 = plan.weeks[0]!

function run(id: string, localDate: string, distanceKm: number, extra: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id,
    startedAt: `${localDate}T05:00:00Z`,
    localDate,
    kind: 'Run',
    distanceKm,
    movingSeconds: distanceKm * 360,
    paceSecondsPerKm: 360,
    plannedTitle: null,
    plannedSessionType: null,
    pace: null,
    averageHeartRate: null,
    source: UPLOADED,
    ...extra,
  }
}

const easy = (id: string, localDate: string, pace: number, heartRate: number | null, type: SessionType = 'Easy') =>
  run(id, localDate, 5, { plannedTitle: 'Easy run', plannedSessionType: type, pace: 'OnTarget', paceSecondsPerKm: pace, averageHeartRate: heartRate })

describe('this week and the plan so far', () => {
  it('counts planned runs done and kilometres run this week, strength left out', () => {
    const runs = [run('hills', '2026-10-13', 5.6), run('extra', '2026-10-14', 4), run('strength-day', '2026-10-12', 3)]

    expect(weekSoFar(week1, runs, runsByDate(runs))).toEqual({ plannedRuns: 4, doneRuns: 1, plannedKm: 17.5, ranKm: 12.6 })
  })

  it('counts runs whose day has passed, and today’s only once it is done, so a morning never reads as a miss', () => {
    const none = runsByDate([])
    expect(adherence(plan, none, '2026-10-13')).toEqual({ due: 0, done: 0, percent: null })

    const hills = runsByDate([run('hills', '2026-10-13', 5.5)])
    expect(adherence(plan, hills, '2026-10-13')).toEqual({ due: 1, done: 1, percent: 100 })
    expect(adherence(plan, hills, '2026-10-16')).toEqual({ due: 2, done: 1, percent: 50 })
  })
})

describe('the missed-session nudge', () => {
  it('names the latest long run or quality session in the past week with no run on its day', () => {
    const missed = missedKeySession(plan, runsByDate([run('hills', '2026-10-13', 5.5)]), '2026-10-19')

    expect(missed?.title).toBe('Long run')
    expect(missed?.date).toBe('2026-10-18')
  })

  it('never nudges about easy runs, sessions that were run, or anything over a week old', () => {
    const runs = runsByDate([run('hills', '2026-10-13', 5.5), run('long', '2026-10-18', 6)])
    expect(missedKeySession(plan, runs, '2026-10-19')).toBeNull()
    // Easy and strides days missed: no nudge.
    expect(missedKeySession(plan, runs, '2026-10-20')).toBeNull()
    // The hills on the 13th are more than a week behind by the 21st.
    expect(missedKeySession(plan, runsByDate([run('long', '2026-10-18', 6)]), '2026-10-21')).toBeNull()
  })
})

describe('the easy-run trend', () => {
  it('takes weekly medians of easy and recovery runs only, and reports the change once there are three weeks', () => {
    const runs = [
      easy('a', '2026-09-28', 400, 150),
      easy('b', '2026-09-30', 390, 148),
      easy('c', '2026-10-06', 385, 146),
      easy('d', '2026-10-13', 375, 144, 'Recovery'),
      // A tempo and an unplanned run don't move the easy trend.
      run('tempo', '2026-10-14', 8, { plannedSessionType: 'Tempo', paceSecondsPerKm: 290, averageHeartRate: 170 }),
      run('extra', '2026-10-15', 5, { paceSecondsPerKm: 300 }),
    ]

    const trend = easyTrend(runs, '2026-10-18')

    expect(trend.points.map((p) => [p.weekStart, p.paceSecondsPerKm, p.heartRate])).toEqual([
      ['2026-09-28', 395, 149],
      ['2026-10-05', 385, 146],
      ['2026-10-12', 375, 144],
    ])
    expect(trend.paceChange).toBe(-20)
    expect(trend.heartRateChange).toBe(-5)
  })

  it('says nothing about a change with fewer than three weeks of easy runs', () => {
    const trend = easyTrend([easy('a', '2026-10-06', 380, 150), easy('b', '2026-10-13', 370, 148)], '2026-10-18')

    expect(trend.points).toHaveLength(2)
    expect(trend.paceChange).toBeNull()
  })

  it('weeks start on Monday', () => {
    expect(mondayOf('2026-10-18')).toBe('2026-10-12')
    expect(mondayOf('2026-10-12')).toBe('2026-10-12')
  })
})

describe('verdict chips', () => {
  it('words each run’s verdict briefly, gently on easy days', () => {
    expect(verdictChip({ plannedSessionType: null, pace: null }).label).toBe('Extra run')
    expect(verdictChip({ plannedSessionType: 'Easy', pace: 'OnTarget' }).label).toBe('Kept easy')
    expect(verdictChip({ plannedSessionType: 'Easy', pace: 'Faster' }).label).toBe('Quicker than easy')
    expect(verdictChip({ plannedSessionType: 'Easy', pace: 'Slower' }).label).toBe('Nice and gentle')
    expect(verdictChip({ plannedSessionType: 'Tempo', pace: 'OnTarget' }).label).toBe('On target')
    expect(verdictChip({ plannedSessionType: 'Tempo', pace: 'Slower' }).label).toBe('Slower than planned')
    expect(verdictChip({ plannedSessionType: 'Hills', pace: 'NoTarget' }).label).toBe('Done')
  })
})

const bests: PersonalBest[] = [
  { name: '5K', distanceMetres: 5000, seconds: 1500, paceSecondsPerKm: 300, activityId: 'long', localDate: '2026-10-18', source: 'Strava' },
  { name: '400 m', distanceMetres: 400, seconds: 95, paceSecondsPerKm: 237.5, activityId: 'hills', localDate: '2026-10-13', source: 'Upload' },
]

const synced = [
  run('hills', '2026-10-13', 5.5, { plannedTitle: 'Hill repeats', plannedSessionType: 'Hills', pace: 'NoTarget' }),
  run('long', '2026-10-18', 6.1, { plannedTitle: 'Long run', plannedSessionType: 'LongRun', pace: 'OnTarget', source: FROM_STRAVA }),
]

describe('progress in one place', () => {
  it('keeps personal bests in Plan › Progress, with a separate strength tab, not a duplicated running overview', async () => {
    render(<PlanView plan={plan} units="km" shareUrl="https://taperday.run/?x" today="2026-10-19" runs={synced} bests={bests} />)
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['This week', 'Calendar', 'Strength', 'Progress'])
    await userEvent.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.queryByText('Running insights', { selector: 'summary' })).not.toBeInTheDocument()

    // Only the headline distances: 5K yes, 400 m no.
    const pbs = screen.getByRole('region', { name: 'Personal best records' })
    expect(pbs).toHaveTextContent('5K')
    expect(pbs).toHaveTextContent('25:00')
    expect(pbs).not.toHaveTextContent('400 m')
  })
})
