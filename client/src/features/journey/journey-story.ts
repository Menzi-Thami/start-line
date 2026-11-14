import type { TrainingPlan } from '../../lib/types'
import type { finishLineSummary } from '../plan/finish-line-model'
import { achievement } from './journey-model'
import type { ChapterWeek, PlanChapter } from './types'

export type LocalSummary = ReturnType<typeof finishLineSummary>

/** What a training story shows, from the account (a chapter) or, signed out, from this device alone. */
export interface StoryData {
  raceName: string
  earned: boolean
  scheduledRuns: number
  confirmedRuns: number
  cutShortRuns: number
  skippedRuns: number
  weeks: number
  runningDays: number | null
  plannedKmConfirmed: number
  recordedKm: number | null
  recordedRuns: number
  longestRecordedKm: number | null
  longestRecordedOn: string | null
  /** Runs a Strava copy matched but the runner hasn't confirmed: shown, never counted. */
  provisional: number
  weekly: ChapterWeek[] | null
  source: 'account' | 'device'
}

/** Plain facts worth a line, only from what was confirmed. Nothing is invented when evidence is thin. */
export function highlights(story: StoryData): string[] {
  const lines: string[] = []
  if (story.scheduledRuns > 0) {
    const share = Math.round((story.confirmedRuns / story.scheduledRuns) * 100)
    lines.push(story.earned ? 'Every planned training run confirmed.' : `${share}% of planned training runs confirmed.`)
  }
  const fullWeeks = story.weekly?.filter(week => week.scheduledRuns > 0 && week.confirmedRuns >= week.scheduledRuns).length ?? 0
  if (fullWeeks > 1) lines.push(`${fullWeeks} weeks with every run confirmed.`)
  let streak = 0
  let best = 0
  for (const week of story.weekly ?? []) {
    streak = week.confirmedRuns > 0 ? streak + 1 : week.scheduledRuns > 0 ? 0 : streak
    best = Math.max(best, streak)
  }
  if (best > 2) lines.push(`${best} weeks in a row with at least one confirmed run.`)
  if (story.cutShortRuns > 0) lines.push(`${story.cutShortRuns} ${story.cutShortRuns === 1 ? 'run' : 'runs'} cut short: listened to your body, not counted as complete.`)
  return lines
}

export function storyFromChapter(chapter: PlanChapter, provisional = 0): StoryData {
  const t = chapter.training
  return {
    raceName: chapter.raceName,
    earned: !!achievement(chapter, 'TrainingComplete') || t.allConfirmed,
    scheduledRuns: t.scheduledRuns,
    confirmedRuns: t.confirmedRuns,
    cutShortRuns: t.cutShortRuns,
    skippedRuns: t.skippedRuns,
    weeks: t.weeks,
    runningDays: t.runningDays,
    plannedKmConfirmed: t.plannedKmConfirmed,
    recordedKm: t.recordedKm,
    recordedRuns: t.recordedRuns,
    longestRecordedKm: t.longestRecordedKm,
    longestRecordedOn: t.longestRecordedOn,
    provisional,
    weekly: chapter.weeks,
    source: 'account',
  }
}

/** Signed out: only this device's ticks are known, so only those (and their planned distance) are shown. */
export function storyFromLocal(plan: TrainingPlan, summary: LocalSummary): StoryData {
  return {
    raceName: plan.race.name,
    earned: summary.earned,
    scheduledRuns: summary.total,
    confirmedRuns: summary.completed,
    cutShortRuns: 0,
    skippedRuns: 0,
    weeks: summary.weeks,
    runningDays: null,
    plannedKmConfirmed: summary.distanceKm,
    recordedKm: null,
    recordedRuns: 0,
    longestRecordedKm: null,
    longestRecordedOn: null,
    provisional: summary.provisional,
    weekly: null,
    source: 'device',
  }
}
