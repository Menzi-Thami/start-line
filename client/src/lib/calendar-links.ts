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
  /** The runner's personal feed, which follows their current plan through every change, rather than this plan's link. */
  personal: boolean
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

  return subscribe(`${apiBase.replace(/\/$/, '')}/api/v1/plans/calendar.ics?${query}`, name, false)
}

/**
 * Links to the runner's personal feed (GET /api/v1/calendar/{token}.ics), for their own current plan. The feed always
 * shows whatever plan is current, the coach's calls and a replan included, in the units chosen in Account, so a calendar
 * subscribed once never goes out of date.
 */
export function personalCalendarLinks(token: string, name: string, apiBase: string): CalendarLinks {
  return subscribe(`${apiBase.replace(/\/$/, '')}/api/v1/calendar/${encodeURIComponent(token)}.ics`, name, true)
}

function subscribe(feed: string, name: string, personal: boolean): CalendarLinks {
  const webcal = feed.replace(/^https?:\/\//, 'webcal://')
  return {
    apple: webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent(`Taperday: ${name}`)}`,
    feed,
    personal,
  }
}
