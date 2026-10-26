import type { ActivitySummary, Session } from '../../lib/types'
import type { SessionCoach } from './useCheckIns'

/** The run Strava sent for a session: synced, on its day, and matched to it. Only ever kept 7 days. */
export function stravaRunFor(session: Session, runs: readonly ActivitySummary[] = []): ActivitySummary | undefined {
  return runs.find((r) => r.source.kind === 'Strava' && r.localDate === session.date && r.plannedSessionType === session.type)
}

/** Whether to offer the tick: Strava has a run for a session whose day has come, and the runner hasn't checked in on it. */
export function offersTick(session: Session, coach: SessionCoach | undefined, runs: readonly ActivitySummary[] = []): boolean {
  return !!coach && session.date <= coach.today && !coach.get(session) && !!stravaRunFor(session, runs)
}
