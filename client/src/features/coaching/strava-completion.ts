import type { Session, SyncedCompletion } from '../../lib/types'
import type { SessionCoach } from './useCheckIns'

/**
 * The Strava completion a session shows, with the runner's own word applied on this screen (it may be newer than the
 * API's answer): completed via Strava while they haven't checked in, a conflict when they said they skipped it, and
 * nothing once they've ticked or logged it themselves, because theirs wins.
 */
export function syncedFor(session: Pick<Session, 'date' | 'type'>, coach: SessionCoach | undefined): SyncedCompletion | undefined {
  const completion = coach?.synced?.(session)
  if (!completion || !coach) return undefined
  const entry = coach.get(session as Session)
  if (!entry) return completion.state === 'Completed' ? completion : { ...completion, state: 'Completed' }
  if (entry.status === 'Skipped') return completion.state === 'Conflict' ? completion : { ...completion, state: 'Conflict' }
  return undefined
}

/** Whether a held Strava run completes the session now: shown as done "via Strava", never as the runner's tick. */
export function completedViaStrava(session: Pick<Session, 'date' | 'type'>, coach: SessionCoach | undefined): boolean {
  return syncedFor(session, coach)?.state === 'Completed'
}
