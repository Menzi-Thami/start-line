import { describe, expect, it } from 'vitest'
import plan5k from '../test/fixtures/plan-5k.json'
import { dayRuns, ranKmByWeek, runsByDate, weekEnd, wellOverPlan } from './plan-runs'
import { UPLOADED } from '../test/sources'
import type { ActivitySummary, TrainingPlan } from './types'

// A 5K plan from Monday 12 October to race day on Sunday 13 December 2026.
const plan = plan5k as TrainingPlan
const week = (n: number) => plan.weeks.find((w) => w.number === n)!

function run(id: string, localDate: string, distanceKm: number, time = '07:00'): ActivitySummary {
  return {
    id,
    startedAt: `${localDate}T${time}:00Z`,
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
  }
}

describe('runsByDate', () => {
  it('groups runs by the runner’s own date, each day in the order they started', () => {
    const byDate = runsByDate([run('pm', '2026-10-18', 2, '17:00'), run('hills', '2026-10-13', 5.6), run('am', '2026-10-18', 6.2, '06:30')])
    expect(byDate.get('2026-10-13')?.map((r) => r.id)).toEqual(['hills'])
    expect(byDate.get('2026-10-18')?.map((r) => r.id)).toEqual(['am', 'pm'])
    expect(byDate.has('2026-10-14')).toBe(false)
  })
})

describe('weekEnd', () => {
  it('is six days after the week starts', () => {
    expect(weekEnd(week(1))).toBe('2026-10-18')
  })
})

describe('dayRuns', () => {
  const sessionsOn = (date: string) => week(1).sessions.filter((s) => s.date === date)

  it('marks a planned run as done', () => {
    const runs = [run('hills', '2026-10-13', 5.6)]
    expect(dayRuns(sessionsOn('2026-10-13'), runs)).toEqual({ done: runs, unplanned: [] })
  })

  it('treats a run on a rest day, or a strength-only day, as unplanned', () => {
    const rest = [run('rest', '2026-10-14', 4)]
    const strength = [run('strength', '2026-10-12', 3)]
    expect(dayRuns(sessionsOn('2026-10-14'), rest)).toEqual({ done: [], unplanned: rest })
    expect(dayRuns(sessionsOn('2026-10-12'), strength)).toEqual({ done: [], unplanned: strength })
  })

  it('has nothing to show without runs', () => {
    expect(dayRuns(sessionsOn('2026-10-13'))).toEqual({ done: [], unplanned: [] })
  })
})

describe('ranKmByWeek', () => {
  const runs = [
    run('a', '2026-10-12', 3),
    run('b', '2026-10-13', 5.6),
    run('c', '2026-10-18', 6.2),
    run('d', '2026-10-19', 6.5),
    run('before', '2026-10-11', 10),
  ]

  it('adds up each started week, Monday to Sunday, and skips weeks still to come', () => {
    const ran = ranKmByWeek(plan.weeks, runs, '2026-10-21')
    expect(ran.get(1)).toBe(14.8)
    expect(ran.get(2)).toBe(6.5)
    expect(ran.has(3)).toBe(false)
  })

  it('counts a started week with no runs as zero', () => {
    expect(ranKmByWeek(plan.weeks, [], '2026-10-12').get(1)).toBe(0)
  })

  it('leaves the race out of race week, like the planned distance does', () => {
    const ran = ranKmByWeek(plan.weeks, [run('shakeout', '2026-12-12', 5), run('race', '2026-12-13', 5)], '2026-12-14')
    expect(ran.get(9)).toBe(5)
  })
})

describe('wellOverPlan', () => {
  it('only speaks up past a fifth over the plan', () => {
    expect(wellOverPlan(40, 48)).toBe(false)
    expect(wellOverPlan(40, 48.1)).toBe(true)
    expect(wellOverPlan(40, 20)).toBe(false)
    expect(wellOverPlan(0, 5)).toBe(false)
  })
})
