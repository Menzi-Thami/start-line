import type { DayOfWeek, TrainingPlan } from '../../lib/types'
import { addDays } from '../../lib/format'
import type { Achievement, AchievementKind, Journey, MaintenanceSession, PlanChapter, RaceOutcome, RecoveryDay, RecoveryPlan } from './types'

/**
 * Treat account responses as untrusted at the browser boundary. A malformed/old API reply (including [] from
 * a synthetic test server) must not crash Home or the plan when a new Journey feature is unavailable.
 * The journey UI handles an error while the ordinary workout, runs and navigation remain usable.
 */
export function isJourneyPayload(value: unknown): value is Journey {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const journey = value as Partial<Journey>
  return Array.isArray(journey.chapters)
    && (journey.recovery == null || (typeof journey.recovery === 'object' && !Array.isArray(journey.recovery)))
    && (journey.maintenance == null || (typeof journey.maintenance === 'object' && !Array.isArray(journey.maintenance)))
}

/** What the plan page's journey section is about right now. Never inferred from a date alone. */
export type FinishStage =
  | 'training' // nothing to show yet: training is under way and not every run is confirmed
  | 'training-complete' // every training run confirmed, race still ahead
  | 'race-day' // race day itself: the runner may record the result once they've run
  | 'race-result-needed' // the race date has passed and nobody has said how it went
  | 'race-recorded' // a result (finished, DNF or DNS) is saved

export function finishStage(chapter: PlanChapter, today: string): FinishStage {
  if (chapter.raceResult) return 'race-recorded'
  if (chapter.raceDate && today === chapter.raceDate) return 'race-day'
  if (chapter.training.raceDatePassed) return 'race-result-needed'
  if (chapter.training.allConfirmed) return 'training-complete'
  return 'training'
}

export const chapterFor = (journey: Journey | null | undefined, planId: string | null | undefined) =>
  planId ? journey?.chapters?.find(chapter => chapter.planId === planId) ?? null : null

/** The recent training chapter that ended, independently of whether its race was run. */
export const recentConclusion = (journey: Journey | null | undefined, today: string): PlanChapter | null =>
  journey?.chapters.filter(chapter => chapter.raceDate && chapter.raceDate < today && chapter.raceDate >= addDays(today, -7))
    .sort((a, b) => (b.raceDate ?? '').localeCompare(a.raceDate ?? ''))[0] ?? null

/** Retained chapters still belong to an experienced runner after the race-week reminder has passed. */
export const lastTrainingChapter = (journey: Journey | null | undefined, today: string): PlanChapter | null =>
  journey?.chapters.find(chapter => chapter.status === 'Concluded' || chapter.status === 'Archived' || !!chapter.raceDate && chapter.raceDate < today) ?? null

/** Home follows the current chapter; a future training lookup must finish before old history takes its place. */
export const isPostTrainingHome = (journey: Journey | null | undefined, currentPlanId: string | null | undefined, today: string): boolean =>
  isLiveRecovery(journey?.recovery) || journey?.maintenance?.status === 'Active'
  || currentPlanId === null && (!!journey?.recovery || !!lastTrainingChapter(journey, today))

export const achievement = (chapter: PlanChapter | null | undefined, kind: AchievementKind): Achievement | null =>
  chapter?.achievements.find(a => a.kind === kind) ?? null

/** The celebration still owed on this plan, race first: it's the bigger moment. Past plans never play by themselves. */
export function owedCelebration(chapter: PlanChapter | null | undefined): Achievement | null {
  if (!chapter || chapter.status !== 'Active') return null
  const race = achievement(chapter, 'RaceFinished')
  if (race && !race.celebratedAt) return race
  const training = achievement(chapter, 'TrainingComplete')
  return training && !training.celebratedAt ? training : null
}

/** Recovery belongs with the race it follows; a manual recovery (no plan) shows wherever the runner is. */
export const recoveryFor = (journey: Journey | null | undefined, planId: string | null | undefined): RecoveryPlan | null => {
  const recovery = journey?.recovery ?? null
  if (!recovery) return null
  return !recovery.planId || recovery.planId === planId ? recovery : null
}

export const isLiveRecovery = (recovery: RecoveryPlan | null | undefined): recovery is RecoveryPlan & { status: 'Active' | 'Paused' } =>
  !!recovery && (recovery.status === 'Active' || recovery.status === 'Paused')

/** A recovery is offered after a race actually run (finished or not), never after a date. */
export const recoveryWelcome = (outcome: RaceOutcome | undefined) => outcome === 'Finished' || outcome === 'DidNotFinish'

/**
 * Days painted on the plan calendar from the recovery plan's own dated days, only inside its own range. A date after
 * the recovery ends is neutral again, exactly like a date outside the training plan.
 */
export function recoveryDayMap(recovery: RecoveryPlan | null | undefined): Map<string, RecoveryDay> {
  const days = new Map<string, RecoveryDay>()
  if (!recovery || recovery.status === 'Ended') return days
  const last = recovery.endedOn && recovery.endedOn < recovery.endsOn ? recovery.endedOn : recovery.endsOn
  for (const day of recovery.days) if (day.date <= last) days.set(day.date, day)
  return days
}

export function maintenanceDayMap(sessions: readonly MaintenanceSession[]): Map<string, MaintenanceSession[]> {
  const days = new Map<string, MaintenanceSession[]>()
  for (const session of sessions) days.set(session.date, [...(days.get(session.date) ?? []), session])
  return days
}

/** Seconds in a .NET TimeSpan string ("01:52:10", "1.02:10:00", "-00:03:05"), or null. */
export function clockSeconds(timeSpan: string | null | undefined): number | null {
  if (!timeSpan) return null
  const match = /^([-+])?(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})/.exec(timeSpan)
  if (!match) return null
  const seconds = Number(match[2] ?? 0) * 86_400 + Number(match[3]) * 3600 + Number(match[4]) * 60 + Number(match[5])
  return match[1] === '-' ? -seconds : seconds
}

/** A duration as a race clock: "1:52:10", "48:05", or "26:10:00" for an ultra. */
export function formatClockSeconds(total: number): string {
  const seconds = Math.abs(Math.round(total))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const text = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  return total < 0 ? `-${text}` : text
}

export function formatClock(timeSpan: string | null | undefined): string | null {
  const seconds = clockSeconds(timeSpan)
  return seconds === null ? null : formatClockSeconds(seconds)
}

/** How the result sits against the goal, in kind words either way. Nothing for a DNF or DNS: no comparison there. */
export function versusGoalWords(result: { outcome: RaceOutcome; versusGoal: string | null; goalTime: string | null }): string | null {
  if (result.outcome !== 'Finished') return null
  const diff = clockSeconds(result.versusGoal)
  const goal = formatClock(result.goalTime)
  if (diff === null || !goal) return null
  if (diff < 0) return `${formatClockSeconds(-diff)} faster than your ${goal} goal.`
  if (diff === 0) return `Right on your ${goal} goal.`
  return `${formatClockSeconds(diff)} over your ${goal} goal. Every finish line counts, and this one is yours.`
}

export const OUTCOME_WORDS: Record<RaceOutcome, string> = {
  Finished: 'Finished',
  DidNotFinish: 'Didn’t finish',
  DidNotStart: 'Didn’t start',
}

/** "Recovery · day 3" counted from race day as day 0, on local dates. */
export const recoveryDayNumber = (raceDate: string, date: string) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${raceDate}T00:00:00Z`)) / 86_400_000)

export const isPastRecovery = (recovery: RecoveryPlan, today: string) => today > recovery.endsOn

/** The seven days from Monday of the week holding `date`. */
export function weekOf(date: string): string[] {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  const monday = addDays(date, -((day + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

const WEEKDAYS: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The days the runner trained on, from the plan itself: what recovery and maintenance suggest first. */
export function planRunDays(plan: TrainingPlan): DayOfWeek[] {
  const days = new Set<DayOfWeek>()
  for (const session of plan.weeks.flatMap(week => week.sessions)) {
    if (session.type === 'Strength' || session.type === 'Race') continue
    days.add(WEEKDAYS[new Date(`${session.date}T00:00:00Z`).getUTCDay()]!)
  }
  return WEEKDAYS.slice(1).concat('Sunday').filter(day => days.has(day))
}

/** Short badge words: the distance where it's a standard one, else the kilometres. */
export function distanceBadge(km: number | null): string {
  if (km === null) return 'Race'
  const standard: [number, string][] = [[5, '5K'], [10, '10K'], [21.1, 'Half'], [42.2, 'Marathon']]
  const match = standard.find(([d]) => Math.abs(d - km) < 0.3)
  return match ? match[1] : `${Math.round(km)}K`
}
