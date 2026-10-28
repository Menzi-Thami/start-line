import { formatDate, formatDistance, type Units } from '../../lib/format'
import { plannedRuns, ranKmByWeek, runsByDate, weekEnd } from '../../lib/plan-runs'
import type { ActivitySummary, CheckIn, PlanWeek, Session, SessionType, TrainingPlan } from '../../lib/types'
import { KEY_SESSIONS } from '../dashboard/dashboard-math'
import { trainingKm } from '../plan/plan-math'
import { EXPECTED_EFFORT } from './check-in-copy'

const round = (km: number) => Math.round(km * 10) / 10

/** The check-in on a session, if the runner gave one. Without check-ins, runs alone say what was done. */
export type CheckInFor = (session: Session) => CheckIn | undefined

/** How the hard sessions felt against how they should: from the 1–10 effort the runner gave when checking in. */
export type Feel = 'harder' | 'right' | 'easier'

const LONG_RUNS: ReadonlySet<SessionType> = new Set<SessionType>(['LongRun', 'LongRunFastFinish', 'LongRunRacePace'])

/** Sessions meant to be hard: how these felt says the most about how the runner is coping. Long runs are steady, so not here. */
const HARD: ReadonlySet<SessionType> = new Set<SessionType>(
  ([...KEY_SESSIONS, 'Fartlek', 'LongRunFastFinish', 'LongRunRacePace'] as SessionType[]).filter((t) => t !== 'LongRun'),
)

/** A check-in that says the run happened, in whatever form. */
const RAN = new Set<CheckIn['status']>(['Done', 'CutShort', 'SwappedForEasy'])

export interface WeekReview {
  /** Planned runs whose day has come, today's only once it's done. Race day is left out, as the weekly total leaves it out. */
  dueRuns: number
  doneRuns: number
  /** The week's planned training distance, all of it. */
  plannedKm: number
  /** Run so far: recorded runs, plus the distance a check-in gave for a run with no recording. */
  ranKm: number
  /** Planned runs whose day has passed with nothing run or checked in as run. */
  missed: Session[]
  /** The week's long run once its day has come: whether it was run, and how far. */
  longRun: { session: Session; done: boolean; ranKm: number | null } | null
  /** From the check-ins on the hard sessions; null without any. */
  feel: Feel | null
  checkedIn: number
  /** A check-in said something hurt or niggled. */
  pain: boolean
  /** The week is over. */
  finished: boolean
}

function expected(type: SessionType): [number, number] | null {
  const range = EXPECTED_EFFORT[type]
  if (!range) return null
  const [low, high] = range.split('–').map(Number)
  return low && high ? [low, high] : null
}

/** Most of the hard sessions' check-ins decide; a tie reads as about right. */
function feelOf(sessions: readonly Session[], checkInFor?: CheckInFor): Feel | null {
  const counts = { harder: 0, right: 0, easier: 0 }
  for (const session of sessions.filter((s) => HARD.has(s.type))) {
    const answer = checkInFor?.(session)
    if (answer?.status === 'SwappedForEasy' || answer?.status === 'Skipped' || answer?.actualSessionType && answer.actualSessionType !== session.type) continue
    const effort = answer?.effort
    const range = expected(session.type)
    if (effort == null || !range) continue
    counts[effort > range[1] ? 'harder' : effort < range[0] ? 'easier' : 'right']++
  }
  if (counts.harder + counts.right + counts.easier === 0) return null
  if (counts.harder > counts.easier && counts.harder >= counts.right) return 'harder'
  if (counts.easier > counts.harder && counts.easier >= counts.right) return 'easier'
  return 'right'
}

/**
 * How a week went: runs done of those due, distance run of planned, the long run, how the hard sessions felt and what
 * was missed. A run recorded on a planned run's day counts as that run, as everywhere else in Taperday; a check-in that
 * says it was run counts too, for runners who don't record. Runs on race day are left out, like the plan's weekly total.
 */
export function reviewWeek(week: PlanWeek, runs: readonly ActivitySummary[], today: string, checkInFor?: CheckInFor, entries?: readonly CheckIn[]): WeekReview {
  const end = weekEnd(week)
  const byDate = runsByDate(runs.filter((r) => r.localDate >= week.startDate && r.localDate <= end && r.localDate <= today))
  const sessions = plannedRuns(week.sessions).filter((s) => s.type !== 'Race')

  const recordedKm = (date: string) => (byDate.get(date) ?? []).reduce((sum, r) => sum + r.distanceKm, 0)
  const isDone = (s: Session) => { const c = checkInFor?.(s); return c ? RAN.has(c.status) : (byDate.get(s.date) ?? []).some((r) => r.source.kind !== 'Strava') }
  const due = sessions.filter((s) => s.date < today || (s.date === today && isDone(s)))

  const answers = entries ?? sessions.flatMap((s) => { const c = checkInFor?.(s); return c ? [c] : [] })
  const ranKm = ranKmByWeek([week], runs, today, answers).get(week.number) ?? 0

  const long = sessions.filter((s) => LONG_RUNS.has(s.type)).sort((a, b) => b.distanceKm - a.distanceKm)[0]
  const longDue = long && due.includes(long) ? long : null
  const longKm = longDue ? recordedKm(longDue.date) || (checkInFor?.(longDue)?.distanceKm ?? 0) : 0

  const checkIns = sessions.map((s) => checkInFor?.(s)).filter((c): c is CheckIn => c != null)
  return {
    dueRuns: due.length,
    doneRuns: due.filter(isDone).length,
    plannedKm: round(trainingKm(week)),
    ranKm: round(ranKm),
    missed: due.filter((s) => !isDone(s)),
    longRun: longDue ? { session: longDue, done: isDone(longDue), ranKm: longKm > 0 ? round(longKm) : null } : null,
    feel: feelOf(due, checkInFor),
    checkedIn: checkIns.length,
    pain: checkIns.some((c) => c.pain !== 'None'),
    finished: end < today,
  }
}

export interface WeekAhead {
  plannedKm: number
  /** Planned distance against the week before, in km; null for the first week. */
  changeKm: number | null
  /** The hard sessions, in order. */
  keySessions: Session[]
  longRun: Session | null
  race: Session | null
}

/** What a week asks for: its distance, how that compares with the week before, the hard sessions and the long run. */
export function weekAhead(plan: Pick<TrainingPlan, 'weeks'>, week: PlanWeek): WeekAhead {
  const previous = plan.weeks.find((w) => w.number === week.number - 1)
  const runs = plannedRuns(week.sessions)
  return {
    plannedKm: round(trainingKm(week)),
    changeKm: previous ? round(trainingKm(week) - trainingKm(previous)) : null,
    keySessions: runs.filter((s) => HARD.has(s.type)).sort((a, b) => a.date.localeCompare(b.date)),
    longRun: runs.filter((s) => LONG_RUNS.has(s.type)).sort((a, b) => b.distanceKm - a.distanceKm)[0] ?? null,
    race: runs.find((s) => s.type === 'Race') ?? null,
  }
}

export const FEEL_WORDS: Record<Feel, string> = {
  harder: 'Hard sessions felt harder than they should',
  right: 'Hard sessions felt about right',
  easier: 'Hard sessions felt easier than they should',
}

/** A week's review in one short line, for the plan's week list: "Ran 4 of 5 runs · 38 of 42 km · Hard sessions felt about right". */
export function reviewLine(review: WeekReview, units: Units): string {
  const parts = [
    review.dueRuns > 0 ? `Ran ${review.doneRuns} of ${review.dueRuns} ${review.dueRuns === 1 ? 'run' : 'runs'}` : null,
    `${formatDistance(review.ranKm, units).split(' ')[0]} of ${formatDistance(review.plannedKm, units)}`,
    review.feel ? FEEL_WORDS[review.feel] : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** "Tempo run, Thursday 22 October". */
export const sessionDay = (s: Session) => `${s.title}, ${formatDate(s.date, 'long').replace(/ \d{4}$/, '')}`
