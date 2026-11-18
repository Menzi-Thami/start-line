import type { ActivitySummary, Session } from '../../lib/types'
import type { SessionCoach } from '../coaching/useCheckIns'
import { syncedFor } from '../coaching/strava-completion'

/** Explicit links never fall back to another recording. Unlinked uploads require a unique prescribed-session match. */
export function recordingForToday(session: Session, coach: SessionCoach | undefined, runs: readonly ActivitySummary[], now = Date.now()): ActivitySummary | null {
  const own = coach?.get(session)
  if (own?.status === 'Skipped') return null
  if (own && !own.activityId) return null
  const id = own?.activityId ?? syncedFor(session, coach)?.activityId
  const available = (run: ActivitySummary) => run.source.kind !== 'Strava' || !run.source.cachedUntil || Date.parse(run.source.cachedUntil) > now
  if (id) return runs.find(run => run.id === id && available(run)) ?? null
  const additional = new Set(coach?.entries?.filter(entry => entry.isAdditional && entry.activityId).map(entry => entry.activityId))
  const matches = runs.filter(run => run.source.kind === 'Upload' && run.kind !== 'Other' && run.localDate === session.date && run.plannedSessionType === session.type && !additional.has(run.id))
  return matches.length === 1 ? matches[0]! : null
}
