import { addDays } from '../../lib/format'
import { dayRuns, plannedRuns, weekEnd, type RunsByDate } from '../../lib/plan-runs'
import type { ActivitySummary, PlanWeek, Session, SessionType, TrainingPlan } from '../../lib/types'
import { trainingKm } from '../plan/plan-math'

const round = (km: number) => Math.round(km * 10) / 10

/** A planned run counts as done when a run was recorded on its day. Rest days and strength never count. */
function isDone(session: Session, byDate: RunsByDate): boolean {
  return dayRuns([session], byDate.get(session.date) ?? []).done.length > 0
}

export interface WeekSoFar {
  plannedRuns: number
  doneRuns: number
  plannedKm: number
  ranKm: number
}

/** This week's planned runs and distance against what was run, race day left out as the plan's weekly total does. */
export function weekSoFar(week: PlanWeek, runs: readonly ActivitySummary[], byDate: RunsByDate): WeekSoFar {
  const end = weekEnd(week)
  const raceDays = new Set(week.sessions.filter((s) => s.type === 'Race').map((s) => s.date))
  const sessions = plannedRuns(week.sessions).filter((s) => s.type !== 'Race')
  const ranKm = runs.filter((r) => r.localDate >= week.startDate && r.localDate <= end && !raceDays.has(r.localDate)).reduce((sum, r) => sum + r.distanceKm, 0)
  return {
    plannedRuns: sessions.length,
    doneRuns: sessions.filter((s) => isDone(s, byDate)).length,
    plannedKm: round(trainingKm(week)),
    ranKm: round(ranKm),
  }
}

export interface Adherence {
  /** Planned runs whose day has passed, plus today's if it's already done. */
  due: number
  done: number
  /** Whole percent, or null before the first planned run is due. */
  percent: number | null
}

/** How many of the plan's runs so far were run. Today's run only counts once it's done, so the morning never reads as a miss. */
export function adherence(plan: TrainingPlan, byDate: RunsByDate, today: string): Adherence {
  const sessions = plan.weeks.flatMap((w) => plannedRuns(w.sessions))
  const due = sessions.filter((s) => s.date < today || (s.date === today && isDone(s, byDate)))
  const done = due.filter((s) => isDone(s, byDate)).length
  return { due: due.length, done, percent: due.length === 0 ? null : Math.round((done / due.length) * 100) }
}

/** The sessions that carry a plan: long runs and quality. Missing an easy run isn't worth a nudge. */
export const KEY_SESSIONS: ReadonlySet<SessionType> = new Set<SessionType>([
  'LongRun',
  'LongRunFastFinish',
  'LongRunRacePace',
  'Tempo',
  'Intervals',
  'CruiseIntervals',
  'ProgressionRun',
  'RacePace',
  'Hills',
])

/** The most recent long run or quality session in the last week with no run on its day, or null. */
export function missedKeySession(plan: TrainingPlan, byDate: RunsByDate, today: string): Session | null {
  const weekAgo = addDays(today, -7)
  const missed = plan.weeks
    .flatMap((w) => w.sessions)
    .filter((s) => KEY_SESSIONS.has(s.type) && s.date < today && s.date >= weekAgo && !isDone(s, byDate))
    .sort((a, b) => b.date.localeCompare(a.date))
  return missed[0] ?? null
}

/** Sessions run at an easy effort on purpose: the cleanest read on aerobic fitness over time. */
const EASY_TREND: ReadonlySet<SessionType> = new Set<SessionType>(['Easy', 'Recovery'])

export interface TrendPoint {
  /** Monday of the week. */
  weekStart: string
  paceSecondsPerKm: number
  heartRate: number | null
  runs: number
}

export interface EasyTrend {
  points: TrendPoint[]
  /** Change from the first week with data to the latest: negative pace is quicker, negative heart rate is lower. */
  paceChange: number | null
  heartRateChange: number | null
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Monday on or before an ISO date. */
export function mondayOf(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return addDays(isoDate, -((day + 6) % 7))
}

/**
 * Easy-run pace and heart rate, week by week, over the last <paramref name="weeks"/> weeks. Only runs matched to an easy
 * or recovery session count: an unplanned run could have been anything. Weekly medians, so one hilly day doesn't swing it.
 */
export function easyTrend(runs: readonly ActivitySummary[], today: string, weeks = 8): EasyTrend {
  const from = addDays(mondayOf(today), -7 * (weeks - 1))
  const easy = runs.filter((r) => r.plannedSessionType != null && EASY_TREND.has(r.plannedSessionType) && r.localDate >= from && r.localDate <= today)
  const byWeek = new Map<string, ActivitySummary[]>()
  for (const run of easy) {
    const key = mondayOf(run.localDate)
    byWeek.set(key, [...(byWeek.get(key) ?? []), run])
  }

  const points = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, list]) => {
      const rates = list.map((r) => r.averageHeartRate).filter((hr): hr is number => hr != null)
      return {
        weekStart,
        paceSecondsPerKm: Math.round(median(list.map((r) => r.paceSecondsPerKm))),
        heartRate: rates.length ? Math.round(median(rates)) : null,
        runs: list.length,
      }
    })

  const first = points[0]
  const last = points.at(-1)
  const enough = points.length >= 3 && first && last
  return {
    points,
    paceChange: enough ? last.paceSecondsPerKm - first.paceSecondsPerKm : null,
    heartRateChange: enough && first.heartRate != null && last.heartRate != null ? last.heartRate - first.heartRate : null,
  }
}

export type ChipTone = 'good' | 'note' | 'neutral'

export interface Chip {
  label: string
  tone: ChipTone
}

const EASY_EFFORT: ReadonlySet<SessionType> = new Set<SessionType>(['Easy', 'Recovery', 'EasyWithStrides', 'MediumLongRun', 'LongRun', 'Shakeout'])

/** A run's verdict in two or three words, for lists. The run page says the rest. */
export function verdictChip(run: Pick<ActivitySummary, 'plannedSessionType' | 'pace'>): Chip {
  const type = run.plannedSessionType
  if (!type) return { label: 'Extra run', tone: 'neutral' }
  const easy = EASY_EFFORT.has(type)
  switch (run.pace) {
    case 'OnTarget':
      return { label: easy ? 'Kept easy' : 'On target', tone: 'good' }
    case 'Faster':
      return { label: easy ? 'Quicker than easy' : 'Quicker than planned', tone: 'note' }
    case 'Slower':
      return easy ? { label: 'Nice and gentle', tone: 'good' } : { label: 'Slower than planned', tone: 'note' }
    default:
      return { label: 'Done', tone: 'good' }
  }
}
