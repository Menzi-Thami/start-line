import { formatDistance, formatPace, formatPaceRange, KM_PER_MILE, type Units } from '../../lib/format'
import type { ActivityKind, Halves, PlannedVsActual, SessionType } from '../../lib/types'

export const KIND_LABEL: Record<ActivityKind, string> = {
  Run: 'Run',
  TrailRun: 'Trail run',
  TreadmillRun: 'Treadmill run',
  Other: 'Activity',
}

// Sessions whose whole point is staying easy: running them fast takes away what they're for.
const EASY_SESSIONS: ReadonlySet<SessionType> = new Set<SessionType>([
  'Easy',
  'Recovery',
  'EasyWithStrides',
  'MediumLongRun',
  'LongRun',
  'Shakeout',
])

/** "12 s/km", converted to s/mi for runners who think in miles. */
function secondsPer(secondsPerKm: number, units: Units): string {
  const value = Math.round(units === 'mi' ? secondsPerKm * KM_PER_MILE : secondsPerKm)
  return `${value} s/${units}`
}

/** "14 km at 7:21–8:10/km", or just the distance when the session had no set pace. */
export function plannedLine(plan: PlannedVsActual, units: Units): string {
  const distance = formatDistance(plan.plannedKm, units)
  if (plan.fastestPaceSecondsPerKm == null || plan.slowestPaceSecondsPerKm == null) return distance
  return `${distance} at ${formatPaceRange(plan.fastestPaceSecondsPerKm, plan.slowestPaceSecondsPerKm, units)}`
}

export function actualLine(plan: PlannedVsActual, units: Units): string {
  return `${formatDistance(plan.actualKm, units)} at ${formatPace(plan.actualPaceSecondsPerKm, units)}`
}

/** "+1.4 km", "−0.3 km", or "as planned" when it's within 100 m. */
export function distanceDifference(plan: PlannedVsActual, units: Units): string {
  const km = plan.distanceDifferenceKm
  if (Math.abs(km) < 0.1) return 'as planned'
  return `${km > 0 ? '+' : '−'}${formatDistance(Math.abs(km), units)}`
}

/** Runner to runner: what the pace means, without guilt either way. */
export function paceVerdict(plan: PlannedVsActual, units: Units): string {
  const off = secondsPer(plan.secondsPerKmOffTarget, units)
  switch (plan.pace) {
    case 'OnTarget':
      return 'Right in the planned pace range.'
    case 'Faster':
      return EASY_SESSIONS.has(plan.sessionType)
        ? `${off} quicker than planned. Easy days do their job at an easy pace, so there’s no need to push them.`
        : `${off} quicker than planned.`
    case 'Slower':
      return `${off} slower than planned. Heat, hills and tired legs all count.`
    case 'NoTarget':
      return 'No set pace for this one.'
  }
}

/** "Second half 12 s/km slower", or a negative split worth noticing. */
export function halvesSummary(halves: Halves, units: Units): string {
  const by = secondsPer(Math.abs(halves.secondHalfSlowerBySecondsPerKm), units)
  switch (halves.verdict) {
    case 'Even':
      return 'Even halves: nicely paced.'
    case 'PositiveSplit':
      return `Second half ${by} slower.`
    case 'NegativeSplit':
      return `Second half ${by} faster: a negative split.`
  }
}
