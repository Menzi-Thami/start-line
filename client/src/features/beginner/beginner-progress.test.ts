import { describe, expect, it } from 'vitest'
import { couchTo5k } from './couch-to-5k'
import { countCompleted, defaultBeginnerProgress, parseBeginnerProgress, sessionDate, sessionId, validRunDays } from './beginner-progress'

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
