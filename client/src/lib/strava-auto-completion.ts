import type { ActivitySummary, Session } from './types'

/**
 * A synced Strava run counts as showing up, regardless of whether its distance
 * matches the prescription. This is a view of the available cache, NOT a persisted
 * check-in: cached activities can expire or be deleted at the provider's request.
 */
export function matchingStravaRun(
  session: Pick<Session, 'date' | 'type'>,
  runs: readonly ActivitySummary[],
): ActivitySummary | undefined {
  if (session.type === 'Strength' || session.type === 'Race') return undefined
  return runs.find(run =>
    run.localDate === session.date &&
    run.source.kind === 'Strava' &&
    run.kind !== 'Other' &&
    Number.isFinite(run.distanceKm) &&
    run.distanceKm > 0,
  )
}

export type RunDistanceFeedback = 'short' | 'long' | 'on-target'

export function runDistanceFeedback(plannedKm: number, actualKm: number): RunDistanceFeedback {
  if (plannedKm <= 0 || !Number.isFinite(plannedKm)) return 'on-target'
  if (actualKm < plannedKm * 0.9) return 'short'
  if (actualKm > plannedKm * 1.1) return 'long'
  return 'on-target'
}

export function runFeedbackMessage(plannedKm: number, actualKm: number): string {
  const formatted = (km: number) => `${Math.round(km * 10) / 10} km`
  switch (runDistanceFeedback(plannedKm, actualKm)) {
    case 'short':
      return `You got out there, and that counts! You ran ${formatted(actualKm)} of your planned ${formatted(plannedKm)}. A shorter day is okay. When you're ready, aim for the full session, but don't force it if you're tired or sore.`
    case 'long':
      return `Great effort! You ran ${formatted(actualKm)} against ${formatted(plannedKm)} planned. More isn't always better. Try to stay close to the plan so you can recover well.`
    default:
      return `Run recorded via Strava. Nice work showing up today!`
  }
}
