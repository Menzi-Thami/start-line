import { describe, expect, it } from 'vitest'
import { findNewStravaArrival, type ArrivalCandidate } from './run-arrival'

const now = Date.parse('2026-11-05T12:00:00Z')
const activity = (id: string, kind: 'Strava' | 'Upload', minutesAgo: number, hoursSinceRun = 1): ArrivalCandidate => ({
  id,
  startedAt: new Date(now - hoursSinceRun * 3_600_000).toISOString(),
  source: { kind, addedAt: new Date(now - minutesAgo * 60_000).toISOString() },
})

describe('in-app notifications for Strava imports', () => {
  it('recognizes a newly imported run but not an upload or previously seen run', () => {
    const fresh = activity('new', 'Strava', 1)
    expect(findNewStravaArrival(new Set(['old']), [fresh], now)?.id).toBe('new')
    expect(findNewStravaArrival(new Set(['new']), [fresh], now)).toBeNull()
    expect(findNewStravaArrival(null, [activity('uploaded', 'Upload', 1)], now)).toBeNull()
  })

  it('does not celebrate old imports, stale activities or refreshed cached runs', () => {
    expect(findNewStravaArrival(null, [activity('old-import', 'Strava', 60)], now)).toBeNull()
    expect(findNewStravaArrival(null, [activity('old-run', 'Strava', 1, 72)], now)).toBeNull()
    expect(findNewStravaArrival(null, [{ ...activity('old-cached', 'Strava', 1), source: { kind: 'Strava' } }], now)).toBeNull()
  })

  it('selects one recent arrival from a batch and rejects timestamps from the future', () => {
    const early = activity('first', 'Strava', 8)
    const late = activity('latest', 'Strava', 2)
    expect(findNewStravaArrival(new Set(), [early, late], now)?.id).toBe('latest')
    expect(findNewStravaArrival(null, [activity('future', 'Strava', -3)], now)).toBeNull()
  })
})
