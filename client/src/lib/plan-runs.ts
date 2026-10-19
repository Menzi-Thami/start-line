import { addDays } from './format'
import type { ActivitySummary, PlanWeek, Session } from './types'

/** Uploaded runs keyed by the day they were run (the runner's own calendar date), each day's runs in the order they started. */
export type RunsByDate = ReadonlyMap<string, readonly ActivitySummary[]>

export function runsByDate(runs: readonly ActivitySummary[]): RunsByDate {
  const byDate = new Map<string, ActivitySummary[]>()
  for (const run of [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const day = byDate.get(run.localDate)
    if (day) day.push(run)
    else byDate.set(run.localDate, [run])
  }
  return byDate
}

/** The last day of a plan week: weeks are seven days from their start date. */
export const weekEnd = (week: Pick<PlanWeek, 'startDate'>) => addDays(week.startDate, 6)

/** Sessions that are runs, so a strength session never counts as the run planned for that day. */
export const plannedRuns = (sessions: readonly Session[]) => sessions.filter((s) => s.type !== 'Strength')

/** What one day of the plan looks like next to what was run: runs on a day with a planned run, or runs on a day without one. */
export function dayRuns(sessions: readonly Session[], runs: readonly ActivitySummary[] = []): { done: readonly ActivitySummary[]; unplanned: readonly ActivitySummary[] } {
  return plannedRuns(sessions).length > 0 ? { done: runs, unplanned: [] } : { done: [], unplanned: runs }
}

const round = (km: number) => Math.round(km * 10) / 10

/**
 * Kilometres run in each plan week that has started by today, keyed by week number. Runs on race day are left out,
 * the same way the planned weekly distance leaves the race out, so race week compares like with like.
 */
export function ranKmByWeek(weeks: readonly PlanWeek[], runs: readonly ActivitySummary[], today: string): Map<number, number> {
  const ran = new Map<number, number>()
  for (const week of weeks) {
    if (week.startDate > today) continue
    const end = weekEnd(week)
    const raceDays = new Set(week.sessions.filter((s) => s.type === 'Race').map((s) => s.date))
    const km = runs
      .filter((r) => r.localDate >= week.startDate && r.localDate <= end && !raceDays.has(r.localDate))
      .reduce((sum, r) => sum + r.distanceKm, 0)
    ran.set(week.number, round(km))
  }
  return ran
}

/** More than a fifth over the planned distance: worth a calm word, nothing more. */
export const wellOverPlan = (plannedKm: number, ranKm: number) => plannedKm > 0 && ranKm > plannedKm * 1.2
