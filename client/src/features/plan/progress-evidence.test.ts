import { describe, expect, it } from 'vitest'
import type { ActivitySummary, PlanWeek } from '../../lib/types'
import { calendarDaysEnding, comparablePaceGroups, progressDistanceTotals, volumeWeeksInPeriod } from './progress-evidence'
const run = (patch: Partial<ActivitySummary> = {}) => ({ id: 'one', localDate: '2026-11-02', plannedSessionType: 'Easy', distanceKm: 5, movingSeconds: 1500, paceSecondsPerKm: 300, source: { kind: 'Upload' }, ...patch }) as ActivitySummary

describe('comparable progress evidence', () => {
  it('keeps session type, approximate distance and source separate', () => {
    const groups = comparablePaceGroups([run(), run({ id: 'two', localDate: '2026-11-04' }), run({ id: 'three', plannedSessionType: 'Recovery' }), run({ id: 'four', distanceKm: 10 }), run({ id: 'five', source: { kind: 'Strava' } as ActivitySummary['source'] })], '2026-10-01', '2026-11-04')
    expect(groups).toHaveLength(4)
    expect(groups[0]!.records.map(item => item.id)).toEqual(['one', 'two'])
  })
  it('does not treat missing data, unplanned runs or future data as comparable fitness evidence', () => {
    expect(comparablePaceGroups([run({ plannedSessionType: null }), run({ paceSecondsPerKm: NaN }), run({ localDate: '2026-12-01' }), run({ movingSeconds: 0 })], '2026-10-01', '2026-11-04')).toEqual([])
  })
  it('uses calendar days across a daylight-saving boundary', () => {
    expect(calendarDaysEnding('2027-03-15', 3)).toEqual(['2027-03-13', '2027-03-14', '2027-03-15'])
  })
  it('keeps a not-yet-started plan inspectable without inventing recorded history', () => {
    const weeks = ['2026-11-09', '2026-11-16', '2026-11-23'].map((startDate, index) => ({ startDate, number: index + 1 })) as PlanWeek[]
    expect(volumeWeeksInPeriod(weeks, '2026-11-04', 4)).toEqual(weeks)
    expect(volumeWeeksInPeriod(weeks, '2026-11-17', 4)).toEqual(weeks.slice(0, 2))
    expect(volumeWeeksInPeriod(weeks, '2027-06-01', 4)).toEqual([])
  })
})

describe('Progress summary source totals', () => {
  const weeks = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'].map((startDate, index) => ({ startDate, number: index + 1, plannedKm: 10 + index * 5 })) as PlanWeek[]
  const today = '2026-11-04'
  it('uses the existing week aggregates without adding recordings or manual logs twice', () => {
    expect(progressDistanceTotals(weeks, new Map([[1, 8.4], [3, 12.6], [999, 100]]), today)).toEqual({ plannedKm: 70, recordedKm: 21, recordedWeeks: 2, elapsedWeeks: 3 })
  })
  it('withholds distance when no source totals are available', () => {
    expect(progressDistanceTotals(weeks, undefined, today).recordedKm).toBeNull()
    expect(progressDistanceTotals(weeks, new Map(), today).recordedKm).toBeNull()
  })
  it('retains an explicitly available zero rather than presenting it as unknown', () => {
    expect(progressDistanceTotals(weeks, new Map([[1, 0]]), today)).toMatchObject({ recordedKm: 0, recordedWeeks: 1 })
  })
  it('does not turn a future week into recorded history', () => {
    expect(progressDistanceTotals(weeks, new Map([[4, 40]]), today)).toMatchObject({ recordedKm: null, recordedWeeks: 0 })
  })
  it('withholds negative and non-finite source values', () => {
    expect(progressDistanceTotals(weeks, new Map([[1, -5], [2, NaN], [3, Infinity]]), today).recordedKm).toBeNull()
  })
  it('does not borrow another period’s totals when no plan weeks are shown', () => {
    expect(progressDistanceTotals([], new Map([[1, 20]]), today)).toEqual({ plannedKm: 0, recordedKm: null, recordedWeeks: 0, elapsedWeeks: 0 })
  })
})
