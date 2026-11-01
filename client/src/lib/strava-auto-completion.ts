import { formatDistance, type Units } from './format'
import type { SyncedCompletion } from './types'

/**
 * A Strava run that completes a planned session is worked out by the API on each read from the runs Taperday holds now
 * (a 7-day cache). It is never stored: when the copy lapses or Strava is disconnected, the session shows whatever the
 * runner ticked. These helpers word it. Completion means the runner showed up and ran; the feedback never claims the
 * prescribed workout was met when it wasn't.
 */

const minutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`

/** Planned against actual, in the one measure the session is judged by. Null when the run recorded nothing to compare. */
export function plannedVsActual(completion: SyncedCompletion, units: Units): { planned: string; actual: string } | null {
  if (completion.measure === 'Duration') {
    return completion.plannedSeconds > 0 && completion.actualSeconds > 0
      ? { planned: minutes(completion.plannedSeconds), actual: minutes(completion.actualSeconds) }
      : null
  }
  return completion.plannedKm > 0 && completion.actualKm > 0
    ? { planned: formatDistance(completion.plannedKm, units), actual: formatDistance(completion.actualKm, units) }
    : null
}

/** The gentle word on a run against its plan: shorter, longer or near. Distances read "5.2 km"; timed sessions "25 min". */
export function completionFeedback(completion: SyncedCompletion, units: Units): string {
  const figures = plannedVsActual(completion, units)
  if (!figures || completion.feedback === 'Near' || completion.feedback === 'Unmeasured') return 'Run recorded. Nice work showing up today.'
  if (completion.feedback === 'Shorter') {
    return `You got out there — that counts. You ran ${figures.actual} of your planned ${figures.planned} today. It's okay to have shorter days. When you're feeling ready, aim for the full session, but don't force it if you're tired or sore.`
  }
  const measure = completion.measure === 'Duration' ? 'time' : 'distance'
  return `Nice work getting your run in! You covered ${figures.actual} against ${figures.planned} planned. More isn't always better — try to follow your planned ${measure} next time so you can recover well and stay consistent.`
}
