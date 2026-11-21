import { KM_PER_MILE, type Units } from '../../lib/format'
import type { AdjustmentKind, CoachEvidence, SessionAdjustmentRequest } from '../../lib/types'

/** "6:30" as seconds, or null. */
function parseClock(value: string): number | null {
  const match = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(value)
  if (!match) return null
  const seconds = Number(match[1]) * 60 + Number(match[2])
  return seconds > 0 ? seconds : null
}

/**
 * The structured change as the API wants it: minutes, kilometres, or seconds per kilometre, whatever units the runner uses.
 * Returns an error in words when the value can't be read.
 */
export function toAdjustmentRequest(date: string, kind: AdjustmentKind, value: string, units: Units): SessionAdjustmentRequest | { error: string } {
  if (kind === 'Pace') {
    const perUnit = parseClock(value)
    if (perUnit === null) return { error: `Enter a pace like 6:30 (minutes and seconds per ${units === 'mi' ? 'mile' : 'km'}).` }
    return { date, kind, paceSecondsPerKm: Math.round(units === 'mi' ? perUnit / KM_PER_MILE : perUnit) }
  }
  const number = Number(value.trim().replace(',', '.'))
  if (!value.trim() || !Number.isFinite(number) || number <= 0) {
    return { error: kind === 'Duration' ? 'Enter the minutes you have, like 30.' : `Enter a distance in ${units === 'mi' ? 'miles' : 'kilometres'}, like 5.` }
  }
  if (kind === 'Duration') return { date, kind, minutes: Math.round(number) }
  return { date, kind, km: Math.round((units === 'mi' ? number * KM_PER_MILE : number) * 100) / 100 }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function period(evidence: CoachEvidence): string {
  const days = Math.round((Date.parse(`${evidence.to}T00:00:00Z`) - Date.parse(`${evidence.from}T00:00:00Z`)) / 86400000) + 1
  return days >= 14 ? `the last ${Math.round(days / 7)} weeks` : `the last ${plural(Math.max(1, days), 'day')}`
}

/** What an answer was based on, in one line: the runner's own runs only, never Strava. */
export function evidenceLine(evidence: CoachEvidence): string {
  const runs = evidence.runs > 0
    ? `Based on your plan and ${plural(evidence.runs, 'run')} you logged or uploaded in ${period(evidence)}.`
    : `Based on your plan. You haven’t logged or uploaded a run in ${period(evidence)}.`
  const strava = evidence.excludedLinkedRuns > 0
    ? `Strava runs aren’t used: ${plural(evidence.excludedLinkedRuns, 'Strava-linked run')} left out.`
    : 'Strava runs aren’t used.'
  return `${runs} ${strava}`
}

/**
 * The coach's distances exactly as the rules set them: they step in quarter kilometres, so "14.25 km" stays 14.25 rather than
 * rounding up past the safe limit it names. Miles keep the app's usual one decimal.
 */
export function exactDistance(km: number, units: Units): string {
  if (units === 'mi') return `${(Math.round((km / KM_PER_MILE) * 10) / 10).toString()} mi`
  return `${(Math.round(km * 100) / 100).toString()} km`
}

export function aboutTime(minutes: number): string {
  if (minutes < 60) return `about ${minutes} min`
  const rest = minutes % 60
  return `about ${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`
}
