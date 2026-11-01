import { describe, expect, it } from 'vitest'
import { matchingStravaRun, runDistanceFeedback, runFeedbackMessage } from './strava-auto-completion'
import type { ActivitySummary, Session } from './types'

const session = { date: '2026-11-02', type: 'Easy', distanceKm: 8 } as Session
const run = { localDate: '2026-11-02', kind: 'Run', source: { kind: 'Strava' }, distanceKm: 5.2 } as ActivitySummary

describe('Strava derived completion', () => {
  it('counts a shorter Strava run as showing up', () => {
    expect(matchingStravaRun(session, [run])).toBe(run)
    expect(runDistanceFeedback(8, 5.2)).toBe('short')
    expect(runFeedbackMessage(8, 5.2)).toContain('that counts')
  })

  it('counts a longer run and encourages sensible recovery', () => {
    expect(matchingStravaRun(session, [{ ...run, distanceKm: 11 }])).toBeDefined()
    expect(runDistanceFeedback(8, 11)).toBe('long')
    expect(runFeedbackMessage(8, 11)).toContain('recover')
  })

  it('does not match activities on another date or a rest/strength session', () => {
    expect(matchingStravaRun({ ...session, date: '2026-11-03' }, [run])).toBeUndefined()
    expect(matchingStravaRun({ ...session, type: 'Strength' }, [run])).toBeUndefined()
    expect(matchingStravaRun(session, [{ ...run, kind: 'Other' }])).toBeUndefined()
  })

  it('rejects invalid or trivial runs', () => {
    expect(matchingStravaRun(session, [{ ...run, distanceKm: 0 }])).toBeUndefined()
    expect(matchingStravaRun(session, [{ ...run, distanceKm: Number.NaN }])).toBeUndefined()
  })
})
