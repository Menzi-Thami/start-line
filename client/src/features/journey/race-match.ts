import type { Activity, ActivitySummary } from '../../lib/types'
import type { PlanChapter } from './types'

// GPS can stop short of the measured course (tunnels, battery loss, a late start). This is a
// suggestion for the runner to confirm, never proof of a finish or an official distance.
const RECORDING_DISTANCE_TOLERANCE = 0.05

/**
 * Suggest likely race recordings already in the runner's library. A recording is evidence, not an
 * official result: the runner must approve the match before a finisher badge or recovery is created.
 * The plan's real race day and distance matter more than titles or a training-plan completion flag.
 */
export function raceMatches(
  chapter: Pick<PlanChapter, 'raceDate' | 'distanceKm'>,
  runs: readonly ActivitySummary[],
): ActivitySummary[] {
  const { raceDate, distanceKm } = chapter
  if (!raceDate || distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 3) return []
  const tolerance = Math.max(0.4, distanceKm * RECORDING_DISTANCE_TOLERANCE)
  return [...new Map(runs.map(run => [run.id, run])).values()]
    .filter(run =>
      run.localDate === raceDate
      && (run.kind === 'Run' || run.kind === 'TrailRun')
      && Number.isFinite(run.distanceKm)
      && Number.isFinite(run.movingSeconds)
      && run.movingSeconds >= 60
      && Math.abs(run.distanceKm - distanceKm) <= tolerance,
    )
    .sort((a, b) =>
      (a.source.kind === 'Strava' ? 0 : 1) - (b.source.kind === 'Strava' ? 0 : 1)
      || Math.abs(a.distanceKm - distanceKm) - Math.abs(b.distanceKm - distanceKm)
      || a.startedAt.localeCompare(b.startedAt),
    )
}

export function verifyRaceRecording(
  chapter: Pick<PlanChapter, 'raceDate' | 'distanceKm'>,
  run: ActivitySummary,
  activity: Activity,
  linkOnly = false,
): Activity {
  if (activity.id !== run.id || activity.localDate !== run.localDate || activity.kind !== run.kind
    || !Number.isFinite(activity.elapsedSeconds) || activity.elapsedSeconds < 60 || activity.elapsedSeconds > 48 * 3600
    || !Number.isFinite(activity.movingSeconds) || activity.movingSeconds < 0 || activity.elapsedSeconds < activity.movingSeconds
    || !Number.isFinite(activity.distanceKm) || activity.distanceKm < 0.1 || activity.distanceKm > 400
    || (!linkOnly && !raceMatches(chapter, [{ ...run, ...activity }]).length)) {
    throw new Error('That recording could not be verified. You can enter your result manually.')
  }
  return activity
}
