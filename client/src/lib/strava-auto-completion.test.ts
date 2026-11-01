import { describe, expect, it } from 'vitest'
import { completionFeedback, plannedVsActual } from './strava-auto-completion'
import type { SyncedCompletion } from './types'

const completion = (overrides: Partial<SyncedCompletion> = {}): SyncedCompletion => ({
  date: '2026-11-02',
  sessionType: 'Easy',
  activityId: 'run-1',
  state: 'Completed',
  measure: 'Distance',
  plannedKm: 8,
  actualKm: 5.2,
  plannedSeconds: 0,
  actualSeconds: 1872,
  feedback: 'Shorter',
  cachedUntil: '2026-11-09T06:00:00Z',
  ...overrides,
})

describe('Strava completion wording', () => {
  it('counts a shorter run as showing up, in the exact words agreed for #177', () => {
    expect(completionFeedback(completion(), 'km')).toBe(
      "You got out there — that counts. You ran 5.2 km of your planned 8 km today. It's okay to have shorter days. When you're feeling ready, aim for the full session, but don't force it if you're tired or sore.",
    )
  })

  it('praises a longer run and nudges towards the planned distance', () => {
    expect(completionFeedback(completion({ actualKm: 11, feedback: 'Longer' }), 'km')).toBe(
      "Nice work getting your run in! You covered 11 km against 8 km planned. More isn't always better — try to follow your planned distance next time so you can recover well and stay consistent.",
    )
  })

  it('says only that the run was recorded when it was near the plan', () => {
    expect(completionFeedback(completion({ actualKm: 8.2, feedback: 'Near' }), 'km')).toBe('Run recorded. Nice work showing up today.')
  })

  it('never invents a comparison for a treadmill run with no distance', () => {
    const treadmill = completion({ actualKm: 0, actualSeconds: 2700, feedback: 'Unmeasured' })
    expect(plannedVsActual(treadmill, 'km')).toBeNull()
    expect(completionFeedback(treadmill, 'km')).toBe('Run recorded. Nice work showing up today.')
  })

  it('compares a time-based session by minutes, never by distance', () => {
    const intervals = completion({ measure: 'Duration', plannedKm: 0, actualKm: 2.1, plannedSeconds: 1800, actualSeconds: 1320, feedback: 'Shorter' })
    expect(plannedVsActual(intervals, 'km')).toEqual({ planned: '30 min', actual: '22 min' })
    expect(completionFeedback(intervals, 'km')).toContain('You ran 22 min of your planned 30 min today.')
    expect(completionFeedback({ ...intervals, actualSeconds: 2400, feedback: 'Longer' }, 'km')).toContain('try to follow your planned time next time')
  })

  it('speaks the runner’s units', () => {
    expect(plannedVsActual(completion(), 'mi')).toEqual({ planned: '5 mi', actual: '3.2 mi' })
  })
})
