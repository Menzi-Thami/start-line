import type { BeginnerProgress } from './beginner-progress'
import { beginnerDate, sessionId } from './beginner-progress'
import type { BeginnerSession } from './couch-to-5k'

export interface BeginnerRecordedRun { date: string; source: string; cachedUntil?: string | null }

/** Only one verified Strava running day is assigned to one scheduled workout.
 * Do not consume an imported run multiple times if a shifted schedule overlaps.
 * Ticked and manually uploaded records aren't treated as Strava evidence.
 */
export function matchBeginnerStrava(
  progress: BeginnerProgress,
  sessions: readonly BeginnerSession[],
  runs: readonly BeginnerRecordedRun[],
  now: number,
): ReadonlySet<string> {
  if (progress.paused) return new Set()
  const dates = new Set(runs.filter(run =>
    run.source === 'Strava' &&
    (!run.cachedUntil || (Number.isFinite(Date.parse(run.cachedUntil)) && Date.parse(run.cachedUntil) > now)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(run.date),
  ).map(run => run.date))
  const used = new Set<string>()
  const completed = new Set<string>()
  for (const session of sessions) {
    const date = beginnerDate(progress, session.week, session.day)
    if (!dates.has(date) || used.has(date)) continue
    used.add(date)
    completed.add(sessionId(session, progress.revision))
  }
  return completed
}
