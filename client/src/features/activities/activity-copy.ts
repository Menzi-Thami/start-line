import { formatDate, formatDistance, formatPace, formatPaceRange, KM_PER_MILE, type Units } from '../../lib/format'
import type { Activity, ActivityKind, Halves, PaceZone, PlannedVsActual, SessionType, Split } from '../../lib/types'

export const KIND_LABEL: Record<ActivityKind, string> = {
  Run: 'Run',
  TrailRun: 'Trail run',
  TreadmillRun: 'Treadmill run',
  Other: 'Activity',
}

export const ZONE_LABEL: Record<PaceZone, string> = {
  Recovery: 'Recovery',
  Easy: 'Easy',
  LongRun: 'Long',
  Tempo: 'Tempo',
  Interval: 'Interval',
  Race: 'Race',
}

/** The effort ramp from tokens.css. Always shown beside a text label, never as the only signal. */
export const ZONE_COLOUR: Record<PaceZone, string> = {
  Recovery: 'var(--effort-recovery)',
  Easy: 'var(--effort-easy)',
  LongRun: 'var(--effort-long)',
  Tempo: 'var(--effort-tempo)',
  Interval: 'var(--effort-interval)',
  Race: 'var(--effort-race)',
}

// Sessions whose whole point is staying easy: running them fast takes away what they're for.
const EASY_SESSIONS: ReadonlySet<SessionType> = new Set<SessionType>(['Easy', 'Recovery', 'EasyWithStrides', 'MediumLongRun', 'LongRun', 'Shakeout'])
const LONG_SESSIONS: ReadonlySet<SessionType> = new Set<SessionType>(['LongRun', 'MediumLongRun', 'LongRunFastFinish', 'LongRunRacePace'])

/** "12 s/km", converted to s/mi for runners who think in miles. */
function secondsPer(secondsPerKm: number, units: Units): string {
  const value = Math.round(units === 'mi' ? Math.abs(secondsPerKm) * KM_PER_MILE : Math.abs(secondsPerKm))
  return `${value} s/${units}`
}

function target(plan: PlannedVsActual, units: Units): string | null {
  return plan.targetFastestSecondsPerKm == null || plan.targetSlowestSecondsPerKm == null
    ? null
    : formatPaceRange(plan.targetFastestSecondsPerKm, plan.targetSlowestSecondsPerKm, units)
}

const repLabel = (metres: number) => (metres >= 1000 ? `${Math.round(metres / 100) / 10} km` : `${Math.round(metres)} m`)

/** "14 km at 7:21–8:10/km", "8 km with 3.2 km at 6:08–6:25/km", "9 km with 5 × 1 km at 4:05–4:15/km". */
export function plannedLine(plan: PlannedVsActual, units: Units): string {
  const distance = formatDistance(plan.plannedKm, units)
  const range = target(plan, units)
  if (!range) return distance
  switch (plan.shape) {
    case 'Continuous':
      return `${distance} with ${formatDistance(plan.workKm, units)} at ${range}`
    case 'Reps':
      return plan.repMetres ? `${distance} with ${Math.round((plan.workKm * 1000) / plan.repMetres)} × ${repLabel(plan.repMetres)} at ${range}` : distance
    default:
      return `${distance} at ${range}`
  }
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

export interface Verdict {
  headline: string
  details: string[]
  next: string | null
}

/** What the run was for and how it went, runner to runner: plain, specific, no hype and no guilt. */
export function runVerdict(run: Activity, units: Units): Verdict {
  const plan = run.plan
  const review = run.review
  if (!plan) {
    return {
      headline: 'An extra run, logged.',
      details: review.fadeFromSplit != null ? [`Pace dropped from km ${review.fadeFromSplit}.`] : [],
      next: null,
    }
  }

  const title = plan.title
  const off = secondsPer(plan.secondsPerKmOffTarget, units)
  const range = target(plan, units)
  const easy = EASY_SESSIONS.has(plan.sessionType)
  const details: string[] = []
  let headline: string
  let tip = ''

  if (plan.pace === 'NoTarget') {
    headline = `${title} done.`
    details.push(plan.shape === 'ByEffort' ? 'Hills and fartlek go by feel, so there’s no pace to check.' : 'No set pace for this one.')
  } else if (easy) {
    const long = LONG_SESSIONS.has(plan.sessionType)
    if (plan.pace === 'OnTarget') {
      headline = long ? `${title} at the right effort.` : `${title}, kept easy.`
    } else if (plan.pace === 'Faster') {
      headline = `${title}, but quicker than ${long ? 'long-run' : 'easy'} pace.`
      details.push(`${off} quicker than the plan’s range. Easy days do their job at an easy pace, so there’s no need to push them.`)
      tip = ' Start it at the slow end of its range.'
    } else {
      headline = `${title}, nice and gentle.`
      details.push(`${off} slower than the plan’s range, which is fine on an easy day.`)
    }
    if (review.fadeFromSplit != null) details.push(`Pace dropped from km ${review.fadeFromSplit}.`)
  } else {
    const fast = review.startedFastBySecondsPerKm
    const fade = review.fadeFromSplit
    if (fast != null && fade != null) headline = `${title} started ${secondsPer(fast, units)} fast and faded from km ${fade}.`
    else if (fast != null) headline = `${title} started ${secondsPer(fast, units)} fast${plan.pace === 'OnTarget' ? ', then settled into range.' : '.'}`
    else if (fade != null) headline = `${title} faded from km ${fade}.`
    else if (plan.pace === 'OnTarget') headline = `${title}, right on pace.`
    else if (plan.pace === 'Faster') headline = `${title}, ${off} quicker than planned.`
    else headline = `${title}, ${off} slower than planned.`

    if (plan.judged === 'WorkBlock' && plan.judgedPaceSecondsPerKm != null && range) {
      details.push(`The ${formatDistance(plan.workKm, units)} of work averaged ${formatPace(plan.judgedPaceSecondsPerKm, units)} against ${range}.`)
    } else if (plan.judged === 'FastestRep' && plan.judgedPaceSecondsPerKm != null && plan.repMetres && range) {
      details.push(`Your fastest ${repLabel(plan.repMetres)} went at ${formatPace(plan.judgedPaceSecondsPerKm, units)} against ${range}.`)
    }
    if (plan.pace === 'Slower') details.push('Heat, hills and tired legs all count.')
    if (fade != null) tip = ' Start a little steadier and see if the finish holds.'
    else if (fast != null || plan.pace === 'Faster') tip = ' Start it at the slow end of its range.'
  }

  if (review.distance === 'ShorterThanPlanned') details.push(`Cut short: ${formatDistance(plan.actualKm, units)} of ${formatDistance(plan.plannedKm, units)}.`)
  if (review.distance === 'LongerThanPlanned') details.push(`${formatDistance(plan.distanceDifferenceKm, units)} longer than planned.`)

  const gap = review.goalPaceGapSecondsPerKm
  if (gap != null && plan.goalPaceSecondsPerKm != null) {
    const goal = formatPace(plan.goalPaceSecondsPerKm, units)
    if (plan.sessionType === 'Race') {
      details.push(gap > 0 ? `${secondsPer(gap, units)} off your goal pace of ${goal}.` : `${secondsPer(gap, units)} inside your goal pace of ${goal}.`)
    } else if (gap >= 0) {
      details.push(`${secondsPer(gap, units)} slower than your goal pace of ${goal}, as a long run should be.`)
    } else {
      details.push(`${secondsPer(gap, units)} quicker than your goal pace of ${goal}. Long runs build the most when they stay slower than race pace.`)
    }
  }

  const next = plan.nextTitle && plan.nextDate ? `Next up: ${plan.nextTitle}, ${formatDate(plan.nextDate, 'long')}.${tip}` : null
  return { headline, details, next }
}

/** Heart rate against pace, said neutrally: drift is information, not a diagnosis. */
export function driftText(run: Activity): string | null {
  const drift = run.review.heartRateDriftPercent
  if (drift == null) return null
  return run.review.heartRateDriftIsNotable
    ? `Heart rate rose ${drift}% against pace from the first half to the second. Heat, fluids and tiredness all push it up, and it tends to shrink as your endurance builds.`
    : `Heart rate held steady against pace (${Math.max(drift, 0)}% drift).`
}

/** "12 s fast", "8 s slow", "In zone", or nothing when the km isn't scored. */
export function splitFit(split: Split): string {
  switch (split.fit) {
    case 'Faster':
      return `${Math.round(split.secondsPerKmOffZone)} s fast`
    case 'Slower':
      return `${Math.round(split.secondsPerKmOffZone)} s slow`
    case 'In':
      return 'In zone'
    default:
      return ''
  }
}

/** "Second half 12 s/km slower", or a negative split worth noticing. */
export function halvesSummary(halves: Halves, units: Units): string {
  const by = secondsPer(halves.secondHalfSlowerBySecondsPerKm, units)
  switch (halves.verdict) {
    case 'Even':
      return 'Even halves: nicely paced.'
    case 'PositiveSplit':
      return `Second half ${by} slower.`
    case 'NegativeSplit':
      return `Second half ${by} faster: a negative split.`
  }
}
