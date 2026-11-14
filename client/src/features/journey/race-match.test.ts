import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '../../lib/types'
import { raceMatches } from './race-match'

const candidate = (overrides: Partial<ActivitySummary> = {}): ActivitySummary => ({
  id: '11111111-1111-4111-8111-111111111111',
  startedAt: '2026-10-18T05:30:00Z',
  localDate: '2026-10-18',
  kind: 'Run',
  distanceKm: 42.31,
  movingSeconds: 15800,
  paceSecondsPerKm: 374,
  plannedTitle: null,
  plannedSessionType: null,
  pace: null,
  averageHeartRate: null,
  source: { kind: 'Strava', viewUrl: 'https://www.strava.com/activities/123', recordedOnGarmin: false, cachedUntil: null },
  ...overrides,
})

describe('race recording suggestions', () => {
  const marathon = { raceDate: '2026-10-18', distanceKm: 42.195 }
  it('finds the runner’s already synced marathon without asking them to log it again', () => {
    expect(raceMatches(marathon, [candidate()]).map(run => run.id)).toEqual([candidate().id])
  })
  it('does not mistake a shakeout, other date or non-running workout for a finish', () => {
    const runs = [
      candidate({ distanceKm: 5 }),
      candidate({ localDate: '2026-10-17' }),
      candidate({ kind: 'Other' }),
      candidate({ movingSeconds: 0 }),
    ]
    expect(raceMatches(marathon, runs)).toEqual([])
  })
  it('ranks Strava ahead of an uploaded duplicate while leaving the final decision to the runner', () => {
    const uploaded = candidate({ id: '22222222-2222-4222-8222-222222222222', source: { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null } })
    expect(raceMatches(marathon, [uploaded, candidate()]).at(0)?.source.kind).toBe('Strava')
  })
  it('does not guess when there is no known race date or distance', () => {
    expect(raceMatches({ raceDate: null, distanceKm: null }, [candidate()])).toEqual([])
  })
})
