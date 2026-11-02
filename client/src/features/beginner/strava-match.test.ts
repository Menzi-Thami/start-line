import { describe, expect, it } from 'vitest'
import { couchTo5k } from './couch-to-5k'
import { defaultBeginnerProgress, repeatBeginnerWeek } from './beginner-progress'
import { matchBeginnerStrava } from './strava-match'

const NOW = Date.parse('2026-11-04T12:00:00Z')
describe('Couch to 5K Strava matching', () => {
  it('counts a valid Strava run regardless of planned distance', () => {
    const progress = defaultBeginnerProgress('2026-11-02')
    const matched = matchBeginnerStrava(progress, couchTo5k(), [{ date: '2026-11-02', source: 'Strava', cachedUntil: '2026-11-05T00:00:00Z' }], NOW)
    expect(matched.has('0:1:1')).toBe(true)
    expect(matched.size).toBe(1)
  })
  it('ignores expired Strava data and ticked activity', () => {
    const progress = defaultBeginnerProgress('2026-11-02')
    const matched = matchBeginnerStrava(progress, couchTo5k(), [
      { date: '2026-11-02', source: 'Strava', cachedUntil: '2026-11-01T00:00:00Z' },
      { date: '2026-11-04', source: 'Ticked' },
    ], NOW)
    expect(matched.size).toBe(0)
  })
  it('does not assign the same running day twice after repeating a week', () => {
    const progress = repeatBeginnerWeek(defaultBeginnerProgress('2026-11-02'))
    const matched = matchBeginnerStrava(progress, couchTo5k(), [{ date: '2026-11-09', source: 'Strava' }], NOW)
    expect(matched.size).toBe(1)
  })
  it('does not automatically tick paused programmes', () => {
    const progress = { ...defaultBeginnerProgress('2026-11-02'), paused: true }
    expect(matchBeginnerStrava(progress, couchTo5k(), [{ date: '2026-11-02', source: 'Strava' }], NOW).size).toBe(0)
  })
})
