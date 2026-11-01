import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '../../lib/types'
import { consistencyNarrative, consistencyWeeks } from './consistency'
import { progressWindows } from '../runner-home/ProgressStory'
const run = (id: string, localDate: string, distanceKm: number): ActivitySummary => ({
  id, localDate, distanceKm, startedAt: localDate + 'T07:00:00Z', kind: 'Run', movingSeconds: 1800, paceSecondsPerKm: 300,
  plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null,
  source: { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null },
})
describe('consistency story', () => {
  it('compares nonoverlapping windows and counts distinct running days', () => {
    const { current, previous } = consistencyWeeks([run('a','2026-11-01',5),run('b','2026-11-01',3),run('c','2026-10-30',6),run('d','2026-10-25',4)],'2026-11-01')
    expect(current).toMatchObject({ runs: 3, days: 2, km: 14 })
    expect(previous).toMatchObject({ runs: 1, days: 1, km: 4 })
    expect(consistencyNarrative(current, previous)).toContain('1 day more')
  })
  it('rejects impossible calendar dates', () => {
    expect(() => consistencyWeeks([], '2026-02-30')).toThrow('Invalid calendar date')
  })
  it('does not claim an earlier week existed when the prior window is empty', () => {
    const { current, previous } = consistencyWeeks([run('latest', '2026-11-01', 5)], '2026-11-01')
    expect(consistencyNarrative(current, previous)).toContain('no runs in the previous seven-day window')
  })
  it('does not invent progress when records are absent', () => {
    const result = consistencyWeeks([], '2026-11-01')
    expect(consistencyNarrative(result.current, result.previous)).toContain('No runs')
  })
})

describe('rolling 4/8/12-week mileage comparisons', () => {
  it('counts recorded runs in inclusive rolling windows and separates the previous window', () => {
    const results = progressWindows([
      run('today', '2026-11-01', 6),
      run('last-week', '2026-10-25', 9),
      run('previous-month', '2026-09-30', 12),
      run('older', '2026-08-01', 3),
    ], '2026-11-01')
    expect(results.map(item => item.weeks)).toEqual([4, 8, 12])
    expect(results[0]).toMatchObject({ distance: 15, previousDistance: 12, runs: 2, days: 2 })
    expect(results[1].distance).toBe(27)
    expect(results[2].distance).toBe(27)
  })
  it('does not count zero or invalid measured distances', () => {
    expect(progressWindows([run('zero','2026-11-01',0)], '2026-11-01')[0].runs).toBe(0)
    expect(progressWindows([], '2026-02-30')).toEqual([])
  })
})
