import { describe, expect, it } from 'vitest'
import { addDays, formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, localToday, parseTimeSpan, toKilometres, toTimeSpan } from './format'

describe('formatPace', () => {
  it('formats seconds per km as minutes and seconds', () => {
    expect(formatPace(341, 'km')).toBe('5:41/km')
  })

  it('converts to minutes per mile', () => {
    expect(formatPace(300, 'mi')).toBe('8:03/mi')
  })

  it('rolls 59.6 seconds over to the next minute instead of showing :60', () => {
    expect(formatPace(359.6, 'km')).toBe('6:00/km')
  })
})

describe('formatPaceRange', () => {
  it('shows one unit suffix for a range', () => {
    expect(formatPaceRange(326, 341, 'km')).toBe('5:26–5:41/km')
  })

  it('collapses a range whose ends match', () => {
    expect(formatPaceRange(341, 341, 'km')).toBe('5:41/km')
  })
})

describe('formatDistance', () => {
  it.each([
    [8, 'km', '8 km'],
    [21.0975, 'km', '21.1 km'],
    [42.195, 'mi', '26.2 mi'],
  ] as const)('%s %s → %s', (km, units, expected) => {
    expect(formatDistance(km, units)).toBe(expected)
  })
})

describe('time spans', () => {
  it('round-trips .NET TimeSpan strings', () => {
    expect(parseTimeSpan('10:30:00')).toBe(37800)
    expect(toTimeSpan(37800)).toBe('10:30:00')
  })

  it('handles efforts longer than a day', () => {
    expect(toTimeSpan(90000)).toBe('1.01:00:00')
    expect(parseTimeSpan('1.01:00:00')).toBe(90000)
  })

  it('rejects anything that is not a time span', () => {
    expect(parseTimeSpan('3:45')).toBeNull()
    expect(parseTimeSpan('soon')).toBeNull()
  })

  it('formats durations the way runners write them', () => {
    expect(formatDuration(1470)).toBe('24:30')
    expect(formatDuration(13500)).toBe('3:45:00')
  })
})

describe('dates', () => {
  it('formats calendar dates without time zones shifting the day', () => {
    expect(formatDate('2027-06-13', 'long')).toBe('Sunday 13 June 2027')
  })

  it('adds days across a month end', () => {
    expect(addDays('2027-01-30', 3)).toBe('2027-02-02')
  })

  it('uses the local calendar date', () => {
    expect(localToday(new Date(2026, 9, 12, 0, 30))).toBe('2026-10-12')
  })

  it('converts miles to kilometres', () => {
    expect(toKilometres(26.2, 'mi')).toBeCloseTo(42.165, 2)
    expect(toKilometres(10, 'km')).toBe(10)
  })
})
