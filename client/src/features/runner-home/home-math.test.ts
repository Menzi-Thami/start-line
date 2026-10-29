import { describe, expect, it } from 'vitest'
import type { LoggedRun, TrainingPlan } from '../../lib/types'
import { fuelling, heartRateZones, splits } from './calculator-math'
import { change, todayInPlan, trainingTotals, weeklyBars } from './home-math'

// Current display rows are resolved and deduplicated by the server; Strava contributions remain temporary.
const run = (date: string, distanceKm: number, source: LoggedRun['source'] = 'Uploaded'): LoggedRun => ({ date, distanceKm, source })

// Friday 23 October 2026.
const today = '2026-10-23'

describe('training totals', () => {
  it('includes Strava in month/year/current chart, while excluding this week from the weekly average', () => {
    const log = [run('2026-10-22', 10, 'Strava')]
    const totals = trainingTotals(log, today)
    expect(totals.month).toEqual({ km: 10, runs: 1, stravaKm: 10 })
    expect(totals.year).toEqual({ km: 10, runs: 1, stravaKm: 10 })
    expect(totals.weeklyAverageKm).toBe(0)
    expect(weeklyBars(log, today, null).at(-1)?.km).toBe(10)
  })

  it('includes an available older Strava run in the last four full weeks', () => {
    expect(trainingTotals([run('2026-10-18', 10, 'Strava')], today).weeklyAverageKm).toBe(2.5)
  })
  const runs = [
    run('2026-10-02', 10),
    run('2026-10-18', 42.2, 'Ticked'),
    run('2026-09-05', 12),
    run('2026-09-30', 8), // last month, but after the 23rd: not in the fair comparison
    run('2026-01-03', 20),
    run('2025-12-31', 15), // last year
  ]

  it('counts this month, the same days of last month, and the year so far, ticks and uploads alike', () => {
    const totals = trainingTotals(runs, today)

    expect(totals.month).toEqual({ km: 52.2, runs: 2 })
    expect(totals.previousMonth).toMatchObject({ km: 12, runs: 1, from: '2026-09-01', to: '2026-09-23' })
    expect(totals.year.km).toBe(92.2) // 10 + 42.2 + 12 + 8 + 20
  })

  it('averages the last four full weeks against the four before', () => {
    // This week starts Monday 19 October; the last four full weeks run 21 Sept to 18 Oct.
    const totals = trainingTotals(runs, today)

    expect(totals.weeklyAverageKm).toBe(15.1) // (8 + 10 + 42.2) / 4
    expect(totals.previousWeeklyAverageKm).toBe(3) // 12 / 4
  })

  it('compares the last day of a short month fairly', () => {
    expect(trainingTotals([], '2026-03-31').previousMonth).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(trainingTotals([], '2026-01-15').previousMonth).toMatchObject({ from: '2025-12-01', to: '2025-12-15' })
  })

  it('says how much up or down, and by what share', () => {
    expect(change(91.3, 120.2)).toEqual({ delta: -28.9, percent: -24 })
    expect(change(10, 0)).toEqual({ delta: 10, percent: null })
  })
})

describe('the weekly bars', () => {
  it('gives twelve weeks, oldest first, this week last, with the plan’s distance where it has one', () => {
    const plan = {
      weeks: [{ number: 1, startDate: '2026-10-19', sessions: [{ date: '2026-10-20', type: 'Easy', distanceKm: 8 }, { date: '2026-10-25', type: 'LongRun', distanceKm: 16 }] }],
    } as unknown as TrainingPlan

    const bars = weeklyBars([run('2026-10-18', 42.2), run('2026-10-20', 6)], today, plan)

    expect(bars).toHaveLength(12)
    expect(bars.at(-1)).toEqual({ weekStart: '2026-10-19', km: 6, plannedKm: 24 })
    expect(bars.at(-2)).toEqual({ weekStart: '2026-10-12', km: 42.2, plannedKm: null })
    expect(bars[0]!.weekStart).toBe('2026-08-03')
  })
})

describe('today in the plan', () => {
  const plan = {
    weeks: [
      {
        startDate: '2026-10-19',
        sessions: [
          { date: '2026-10-22', type: 'Tempo', title: 'Tempo run' },
          { date: '2026-10-23', type: 'Strength', title: 'Strength & mobility' },
          { date: '2026-10-25', type: 'LongRun', title: 'Long run' },
        ],
      },
    ],
  } as unknown as TrainingPlan

  it('finds a rest day, with the strength session beside it and the next run after it', () => {
    const day = todayInPlan(plan, today)

    expect(day.runs).toEqual([])
    expect(day.strength.map((s) => s.title)).toEqual(['Strength & mobility'])
    expect(day.next?.title).toBe('Long run')
  })
})

describe('the calculators', () => {
  it('splits a 10K evenly to the second, and a half marathon with a part-kilometre at the end', () => {
    const even = splits(10, 3000, 'km')
    expect(even).toHaveLength(10)
    expect(even.every((s) => Math.abs(s.splitSeconds - 300) < 1e-9)).toBe(true)

    const half = splits(21.0975, 7200, 'km')
    expect(half).toHaveLength(22)
    expect(half.at(-1)!.label).toBe('0.1')
    expect(half.at(-1)!.elapsedSeconds).toBeCloseTo(7200)
  })

  it('runs a negative split quicker in the second half, finishing on the goal', () => {
    const negative = splits(10, 3000, 'km', true)

    expect(negative[0]!.splitSeconds).toBeGreaterThan(negative[9]!.splitSeconds)
    expect(negative.at(-1)!.elapsedSeconds).toBeCloseTo(3000)
  })

  it('splits by the mile for runners who think in miles', () => {
    const miles = splits(42.195, 4 * 3600, 'mi')

    expect(miles).toHaveLength(27)
    expect(miles.at(-1)!.label).toBe('0.2')
  })

  it('gives five heart-rate zones from a maximum, end to end', () => {
    const zones = heartRateZones(190)

    expect(zones.map((z) => [z.name, z.low, z.high])).toEqual([
      ['Recovery', 95, 114],
      ['Easy', 114, 133],
      ['Steady', 133, 152],
      ['Threshold', 152, 171],
      ['Max', 171, 190],
    ])
  })

  it('needs no fuel for a short race, and more an hour the longer it runs', () => {
    expect(fuelling(50 * 60).perHour).toBeNull()

    const half = fuelling(2 * 3600)
    expect(half.perHour).toEqual([30, 60])
    expect(half.total).toEqual([60, 120])
    expect(half.gels).toEqual([2, 5])

    expect(fuelling(4.5 * 3600).perHour).toEqual([60, 90])
  })
})
