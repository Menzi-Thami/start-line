import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '../../lib/types'
import { trainingTrend, trainingWindows } from './windows'

const run = (id: string, localDate: string, distanceKm: number): ActivitySummary => ({
  id, localDate, distanceKm, startedAt: localDate + 'T06:00:00Z', kind: 'Run',
  movingSeconds: 1800, paceSecondsPerKm: 300, plannedTitle: null,
  plannedSessionType: null, pace: null, averageHeartRate: null,
  source: { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null },
})
describe('28-day training intelligence', () => {
  it('compares non-overlapping windows and distinct active days', () => {
    const { current, previous } = trainingWindows([
      run('a', '2026-11-01', 10), run('b', '2026-11-01', 5),
      run('c', '2026-10-04', 12), run('d', '2026-09-06', 99),
    ], '2026-11-01')
    expect(current.runs).toBe(2)
    expect(current.activeDays).toBe(1)
    expect(current.km).toBe(15)
    expect(previous.km).toBe(12)
    expect(trainingTrend(current, previous)).toContain('25% higher')
  })
  it('never asserts meaningful comparisons when previous records are missing', () => {
    const { current, previous } = trainingWindows([run('a', '2026-11-01', 5)], '2026-11-01')
    expect(trainingTrend(current, previous)).toContain('Not enough')
  })
  it('does not count future records or invalid distances', () => {
    const { current } = trainingWindows([run('a', '2026-11-02', 6), run('b','2026-10-31',0)], '2026-11-01')
    expect(current.runs).toBe(1)
    expect(current.km).toBe(0)
    expect(current.missingDistance).toBe(1)
  })
})
