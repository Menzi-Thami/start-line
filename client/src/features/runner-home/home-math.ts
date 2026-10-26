import { addDays } from '../../lib/format'
import type { LoggedRun, Session, TrainingPlan } from '../../lib/types'
import { mondayOf } from '../dashboard/dashboard-math'
import { trainingKm } from '../plan/plan-math'

const round1 = (km: number) => Math.round(km * 10) / 10

export interface Totals {
  km: number
  runs: number
}

/**
 * The runs between two dates, from the runner's kept log: sessions they ticked off, at the plan's distance, and runs they
 * uploaded. Never a Strava run: those stay 7 days, and so must anything worked out from them.
 */
function totalOf(runs: readonly LoggedRun[], from: string, to: string): Totals {
  const inRange = runs.filter((r) => r.date >= from && r.date <= to)
  return {
    km: round1(inRange.reduce((sum, r) => sum + r.distanceKm, 0)),
    runs: inRange.length,
  }
}

export interface Change {
  /** Up or down, in the measure's own units. */
  delta: number
  /** Whole percent of the earlier figure, or null when there was nothing to compare with. */
  percent: number | null
}

export function change(current: number, previous: number): Change {
  return { delta: round1(current - previous), percent: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null }
}

export interface TrainingTotals {
  month: Totals
  /** The same days of last month (1st to today's date), so a month in progress is compared fairly. */
  previousMonth: Totals & { from: string; to: string }
  year: Totals
  /** Kilometres a week over the last four full weeks (Monday to Sunday), and the four before them. */
  weeklyAverageKm: number
  previousWeeklyAverageKm: number
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

export function trainingTotals(runs: readonly LoggedRun[], today: string): TrainingTotals {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const day = Number(today.slice(8, 10))
  const lastMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const prefix = `${lastMonth.year}-${String(lastMonth.month).padStart(2, '0')}`
  const previousFrom = `${prefix}-01`
  const previousTo = `${prefix}-${String(Math.min(day, daysInMonth(lastMonth.year, lastMonth.month))).padStart(2, '0')}`

  const monday = mondayOf(today)
  const last4 = totalOf(runs, addDays(monday, -28), addDays(monday, -1))
  const before4 = totalOf(runs, addDays(monday, -56), addDays(monday, -29))

  return {
    month: totalOf(runs, `${today.slice(0, 7)}-01`, today),
    previousMonth: { ...totalOf(runs, previousFrom, previousTo), from: previousFrom, to: previousTo },
    year: totalOf(runs, `${year}-01-01`, today),
    weeklyAverageKm: round1(last4.km / 4),
    previousWeeklyAverageKm: round1(before4.km / 4),
  }
}

export interface WeekBar {
  /** Monday of the week. */
  weekStart: string
  km: number
  /** What the runner's plan asked for that week, when the plan covers it. */
  plannedKm: number | null
}

/** Distance run in each of the last <paramref name="weeks"/> weeks, this one included, oldest first. */
export function weeklyBars(runs: readonly LoggedRun[], today: string, plan: TrainingPlan | null, weeks = 12): WeekBar[] {
  const monday = mondayOf(today)
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(monday, -7 * (weeks - 1 - i))
    const planned = plan?.weeks.find((w) => w.startDate === weekStart)
    return {
      weekStart,
      km: totalOf(runs, weekStart, addDays(weekStart, 6)).km,
      plannedKm: planned ? round1(trainingKm(planned)) : null,
    }
  })
}

export interface TodayInPlan {
  /** Today's runs (strength sessions sit alongside, in <see cref="strength"/>). Empty on a rest day. */
  runs: Session[]
  strength: Session[]
  /** The next run after today, if the plan has one. */
  next: Session | null
}

export function todayInPlan(plan: TrainingPlan, today: string): TodayInPlan {
  const sessions = plan.weeks.flatMap((w) => w.sessions)
  return {
    runs: sessions.filter((s) => s.date === today && s.type !== 'Strength'),
    strength: sessions.filter((s) => s.date === today && s.type === 'Strength'),
    next: sessions.find((s) => s.date > today && s.type !== 'Strength') ?? null,
  }
}
