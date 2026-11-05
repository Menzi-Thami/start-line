import { describe, expect, it } from 'vitest'
import { couchTo5k } from './couch-to-5k'
import { beginnerDate, countCompleted, defaultBeginnerProgress, parseBeginnerProgress, repeatBeginnerWeek, resumeBeginnerProgress, sessionDate, sessionId, validRunDays } from './beginner-progress'

describe('beginner programme progress', () => {
  it('requires three run days and rest between each', () => {
    expect(validRunDays(['Monday', 'Wednesday', 'Friday'])).toBe(true)
    expect(validRunDays(['Monday', 'Tuesday', 'Friday'])).toBe(false)
    expect(validRunDays(['Monday', 'Wednesday', 'Sunday'])).toBe(false)
  })
  it('computes dates from the runner-selected start, including week boundaries', () => {
    const days = ['Monday', 'Wednesday', 'Friday'] as const
    expect(sessionDate('2026-11-02', days, 1, 1)).toBe('2026-11-02')
    expect(sessionDate('2026-11-02', days, 2, 1)).toBe('2026-11-09')
    expect(sessionDate('2026-11-03', days, 1, 1)).toBe('2026-11-04')
  })
  it('repeating a week postpones this and subsequent weeks without shifting earlier weeks', () => {
    const start = defaultBeginnerProgress('2026-11-02')
    const p = { ...start, week: 2, completed: ['0:1:1', '0:2:1'] }
    const next = repeatBeginnerWeek(p)
    expect(next.completed).toEqual(['0:1:1'])
    expect(beginnerDate(next, 1, 1)).toBe('2026-11-02')
    expect(beginnerDate(next, 2, 1)).toBe('2026-11-16')
    expect(beginnerDate(next, 3, 1)).toBe('2026-11-23')
  })
  it('resume postpones the active and future weeks by calendar days across DST', () => {
    const p = { ...defaultBeginnerProgress('2027-03-01'), week: 2, paused: true, pausedOn: '2027-03-12' }
    const resumed = resumeBeginnerProgress(p, '2027-03-16')
    expect(resumed.paused).toBe(false)
    expect(beginnerDate(resumed, 1, 1)).toBe('2027-03-01')
    expect(beginnerDate(resumed, 2, 1)).toBe('2027-03-12')
    expect(beginnerDate(resumed, 3, 1)).toBe('2027-03-19')
  })
  it('persists completed sessions and rejects damaged storage', () => {
    const today = '2026-11-02'
    const p = { ...defaultBeginnerProgress(today), completed: ['0:1:1', '0:1:2'] }
    expect(parseBeginnerProgress(JSON.stringify(p), today)).toEqual(p)
    expect(countCompleted(p, couchTo5k())).toBe(2)
    expect(parseBeginnerProgress('{broken', today)).toEqual(defaultBeginnerProgress(today))
    expect(parseBeginnerProgress(JSON.stringify({ ...p, week: 99 }), today)).toEqual(defaultBeginnerProgress(today))
    expect(sessionId({ week: 9, day: 3 })).toBe('0:9:3')
  })
})
