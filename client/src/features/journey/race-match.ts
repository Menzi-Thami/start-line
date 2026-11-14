import type { ActivitySummary } from '../../lib/types'
import type { PlanChapter } from './types'

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
  const tolerance = Math.max(0.4, distanceKm * 0.035)
  return runs
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
