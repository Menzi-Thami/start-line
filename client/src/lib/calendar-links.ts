import type { Units } from './format'
import type { GeneratePlanRequest } from './types'

export interface CalendarLinks {
  /** Subscribe in Apple Calendar on iPhone, iPad or Mac: the webcal scheme opens the "Subscribe" prompt. */
  apple: string
  /** Google Calendar's "add by URL", on the web; it then shows on the runner's phone too. */
  google: string
  /** Outlook on the web's "add from web". */
  outlook: string
  /** The feed itself, for anything else that subscribes by URL. */
  feed: string
}

/**
 * Links that subscribe a calendar app to this plan's feed (GET /api/v1/plans/calendar.ics). The plan's own inputs
 * are the query, so the feed needs no account or token. apiBase is the API's origin: in development the API sits
 * behind the dev server, so the page's own origin is used.
 */
export function calendarLinks(request: GeneratePlanRequest, units: Units, name: string, apiBase: string): CalendarLinks {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(request)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) value.forEach((v) => query.append(key, String(v)))
    else query.append(key, String(value))
  }
  if (units === 'mi') query.append('units', 'mi')

  const feed = `${apiBase.replace(/\/$/, '')}/api/v1/plans/calendar.ics?${query}`
  const webcal = feed.replace(/^https?:\/\//, 'webcal://')
  return {
    apple: webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent(`Taperday: ${name}`)}`,
    feed,
  }
}
