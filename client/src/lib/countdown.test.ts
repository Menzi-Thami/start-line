import { describe, expect, it } from 'vitest'
import { daysBetween, progressBetween } from './countdown'

describe('daysBetween', () => {
  it('counts whole calendar days, ignoring time zones and clock changes', () => {
    expect(daysBetween('2026-10-08', '2027-06-13')).toBe(248)
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2)
    expect(daysBetween('2027-06-13', '2027-06-13')).toBe(0)
    expect(daysBetween('2027-06-14', '2027-06-13')).toBe(-1)
  })
})

describe('progressBetween', () => {
  it('is how far today is from the start to the end', () => {
    expect(progressBetween('2027-01-01', '2027-01-11', '2027-01-06')).toBe(0.5)
  })

  it('is empty before the start and full on (or after) the end day', () => {
    expect(progressBetween('2027-01-01', '2027-01-11', '2026-12-25')).toBe(0)
    expect(progressBetween('2027-01-01', '2027-01-11', '2027-01-11')).toBe(1)
    expect(progressBetween('2027-01-01', '2027-01-11', '2027-02-01')).toBe(1)
  })

  it('treats a window with no length as complete', () => {
    expect(progressBetween('2027-01-01', '2027-01-01', '2026-12-31')).toBe(1)
  })
})
