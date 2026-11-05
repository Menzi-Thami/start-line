import type { BeginnerProgress } from './beginner-progress'
import { sessionId } from './beginner-progress'

export type BeginnerTrainingStatus = 'confirmed' | 'recorded' | 'planned'

/** Explicit check-ins and temporary provider observations are different facts. */
export function beginnerTrainingStatus(
  progress: BeginnerProgress, week: number, day: 1 | 2 | 3, recorded: ReadonlySet<string>,
): BeginnerTrainingStatus {
  const id = sessionId({ week, day }, progress.revision)
  if (progress.completed.includes(id)) return 'confirmed'
  if (recorded.has(id)) return 'recorded'
  return 'planned'
}

export function beginnerWeekSummary(
  progress: BeginnerProgress, week: number, recorded: ReadonlySet<string>,
) {
  const sessions = ([1, 2, 3] as const)
  const confirmed = sessions.filter(day => beginnerTrainingStatus(progress, week, day, recorded) === 'confirmed').length
  const provisional = sessions.filter(day => beginnerTrainingStatus(progress, week, day, recorded) === 'recorded').length
  return { confirmed, provisional, remaining: sessions.length - confirmed - provisional, total: sessions.length }
}
