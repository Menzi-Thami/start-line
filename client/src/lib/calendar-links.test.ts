import { describe, expect, it } from 'vitest'
import { calendarLinks, personalCalendarLinks } from './calendar-links'
import type { GeneratePlanRequest } from './types'

const request: GeneratePlanRequest = {
  raceSlug: 'comrades-2027',
  raceName: null,
  distanceKm: null,
  raceDate: null,
  goalTime: '10:30:00',
  runDays: ['Tuesday', 'Thursday', 'Sunday'],
  longRunDay: 'Sunday',
  currentWeeklyKm: null,
  experience: 'Regular',
  strengthDays: [],
  planFrom: '2026-10-08',
}

describe('calendarLinks', () => {
  const links = calendarLinks(request, 'km', 'Comrades Marathon', 'https://api.example.com/')

  it('points at the plan’s feed, with lists as repeated keys and empty answers left out', () => {
    const feed = new URL(links.feed)

    expect(`${feed.origin}${feed.pathname}`).toBe('https://api.example.com/api/v1/plans/calendar.ics')
    expect(feed.searchParams.getAll('runDays')).toEqual(['Tuesday', 'Thursday', 'Sunday'])
    expect(feed.searchParams.get('goalTime')).toBe('10:30:00')
    expect(feed.searchParams.get('planFrom')).toBe('2026-10-08')
    expect(feed.searchParams.has('raceName')).toBe(false)
    expect(feed.searchParams.has('units')).toBe(false)
  })

  it('subscribes Apple Calendar with webcal, which opens the Subscribe prompt on an iPhone', () => {
    expect(links.apple).toBe(links.feed.replace('https://', 'webcal://'))
  })

  it('hands Google and Outlook the feed by URL', () => {
    expect(new URL(links.google).searchParams.get('cid')).toBe(links.apple)
    const outlook = new URL(links.outlook)
    expect(outlook.searchParams.get('url')).toBe(links.feed)
    expect(outlook.searchParams.get('name')).toBe('Taperday: Comrades Marathon')
  })

  it('asks for miles when the runner uses them', () => {
    expect(new URL(calendarLinks(request, 'mi', 'x', 'https://api.example.com').feed).searchParams.get('units')).toBe('mi')
  })
})

describe('personalCalendarLinks', () => {
  const links = personalCalendarLinks('abc_DEF-123', 'Comrades Marathon', 'https://api.example.com/')

  it('points at the runner’s own feed, which follows their current plan', () => {
    expect(links.feed).toBe('https://api.example.com/api/v1/calendar/abc_DEF-123.ics')
    expect(links.personal).toBe(true)
    expect(calendarLinks(request, 'km', 'x', 'https://api.example.com').personal).toBe(false)
  })

  it('subscribes Apple, Google and Outlook to it the same way', () => {
    expect(links.apple).toBe('webcal://api.example.com/api/v1/calendar/abc_DEF-123.ics')
    expect(new URL(links.google).searchParams.get('cid')).toBe(links.apple)
    const outlook = new URL(links.outlook)
    expect(outlook.searchParams.get('url')).toBe(links.feed)
    expect(outlook.searchParams.get('name')).toBe('Taperday: Comrades Marathon')
  })
})
