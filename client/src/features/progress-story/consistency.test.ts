import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '../../lib/types'
import { consistencyNarrative, consistencyWeeks } from './consistency'
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
  it('does not invent progress when records are absent', () => {
    const result = consistencyWeeks([], '2026-11-01')
    expect(consistencyNarrative(result.current, result.previous)).toContain('No runs')
  })
})
