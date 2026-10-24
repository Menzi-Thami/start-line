import { formatDistance, formatPaceRange, type Units } from './format'
import type { PaceZone, SessionStep } from './types'

/** How each zone is said inside a step: "800 m at interval pace". */
const ZONE_WORDS: Record<PaceZone, string> = {
  Recovery: 'recovery pace',
  Easy: 'easy pace',
  LongRun: 'long-run pace',
  Tempo: 'tempo pace',
  Interval: 'interval pace',
  Race: 'race pace',
}

/** "20 s", "90 s", "2 min", "25 min", "1 h 5 min": how long a step lasts, the way a runner says it. */
export function formatStepTime(seconds: number): string {
  if (seconds < 120 && seconds % 60 !== 0) return `${Math.round(seconds)} s`
  if (seconds < 120) return seconds === 60 ? '60 s' : `${seconds / 60} min`
  const minutes = seconds / 60
  if (!Number.isInteger(minutes)) return `${Math.round(minutes * 10) / 10} min`
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}

/** "800 m" for a short rep in kilometres, otherwise the distance in the runner's units. */
function formatStepDistance(km: number, units: Units): string {
  return units === 'km' && km < 1 ? `${Math.round(km * 1000)} m` : formatDistance(km, units)
}

const amount = (step: SessionStep, units: Units): string | null =>
  step.distanceKm != null ? formatStepDistance(step.distanceKm, units) : step.durationSeconds != null ? formatStepTime(step.durationSeconds) : null

const pace = (step: SessionStep, units: Units): string | null =>
  step.fastestSecondsPerKm != null && step.slowestSecondsPerKm != null ? formatPaceRange(step.fastestSecondsPerKm, step.slowestSecondsPerKm, units) : null

/**
 * One step in words: "Warm up: 2 km easy · 6:12–6:45/km", "800 m at interval pace · 4:58–5:10/km", "90 s easy jog",
 * "Repeat 5 times:". A repeat's own steps are worded one by one beneath it.
 */
export function stepText(step: SessionStep, units: Units): string {
  const howMuch = amount(step, units)
  const range = pace(step, units)
  const withPace = (text: string) => (range ? `${text} · ${range}` : text)
  switch (step.kind) {
    case 'Repeat':
      return `Repeat ${step.times} times:`
    case 'WarmUp':
      return withPace(`Warm up: ${howMuch} easy`)
    case 'CoolDown':
      return withPace(`Cool down: ${howMuch} easy`)
    case 'Recover':
      return withPace(howMuch ? `${howMuch} ${(step.effort ?? 'easy jog').toLowerCase()}` : (step.effort ?? 'Recover'))
    default:
      if (range && step.zone) return `${howMuch} at ${ZONE_WORDS[step.zone]}${step.effort ? ` (${step.effort.toLowerCase()})` : ''} · ${range}`
      return `${howMuch}${step.effort ? `: ${step.effort.toLowerCase()}` : ''}`
  }
}

/** Whether a session's steps say more than its own distance and pace already do: more than one plain step. */
export const hasSteps = (steps: readonly SessionStep[]) => steps.length > 1 || steps.some((s) => s.kind === 'Repeat')
