import { addDays } from '../../lib/format'
import type { RecentResultInputs } from '../../lib/plan-url'
import { durationSeconds, type Duration } from './duration'

export const RECENT_DISTANCES = [
  { label: '5K', km: 5 },
  { label: '10K', km: 10 },
  { label: 'Half marathon', km: 21.0975 },
  { label: 'Marathon', km: 42.195 },
] as const

/** Roughly when it was run, in days: the coach only trusts a result from the last six weeks. */
export const RECENT_AGES = [
  { label: 'In the last 2 weeks', days: 7 },
  { label: '2 to 4 weeks ago', days: 21 },
  { label: '4 to 6 weeks ago', days: 35 },
] as const

/** A recent race or time trial as the form holds it: used to estimate a goal, and by the coach to judge one. */
export interface RecentDraft {
  km: number
  time: Duration
  /** Days ago. */
  ago: number
}

export const emptyRecent = (): RecentDraft => ({ km: 10, time: { h: '', m: '', s: '' }, ago: 7 })

/** The result to send with the plan, or undefined while no time is entered. */
export function recentInputs(draft: RecentDraft, today: string): RecentResultInputs | undefined {
  const seconds = durationSeconds(draft.time)
  return seconds > 0 ? { km: draft.km, seconds, date: addDays(today, -draft.ago) } : undefined
}

/** The form's view of a result already on a plan: the nearest "how long ago" that covers it. */
export function recentDraft(recent: RecentResultInputs | undefined, today: string): RecentDraft {
  if (!recent) return emptyRecent()
  const days = Math.round((Date.parse(today) - Date.parse(recent.date)) / 86_400_000)
  const ago = (RECENT_AGES.find((a) => days <= a.days) ?? RECENT_AGES[RECENT_AGES.length - 1]!).days
  const hours = Math.floor(recent.seconds / 3600)
  return {
    km: recent.km,
    time: { h: String(hours), m: String(Math.floor((recent.seconds % 3600) / 60)), s: String(Math.round(recent.seconds % 60)) },
    ago,
  }
}

/** "10K in 50:00", for the review screen. */
export const describeRecent = (draft: RecentDraft, formatted: string): string => {
  const known = RECENT_DISTANCES.find((d) => d.km === draft.km)
  return `${known ? known.label : `${draft.km} km`} in ${formatted}`
}
