import { daysBetween } from '../../lib/countdown'
import { addDays } from '../../lib/format'
import type { PlanWeek, Session, TrainingPlan } from '../../lib/types'

/** Race week shows its training only; the race itself would dwarf every other bar. */
export const trainingKm = (week: PlanWeek) =>
  Math.round(week.sessions.filter((s) => s.type !== 'Race').reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10

export const sessionKey = (s: Pick<Session, 'date' | 'type'>) => `${s.date}|${s.type}`

/**
 * Which week numbers (by index) to print under the bars: this week's always, the last unless this week is right
 * beside it, then every `every`th week, skipping any that would sit next to one already shown, so two-digit numbers
 * never run together.
 */
export function weekLabels(count: number, current: number | null): Set<number> {
  const every = count > 24 ? 4 : count > 12 ? 2 : 1
  const shown = new Set<number>()
  const fits = (i: number) => [...shown].every((s) => Math.abs(s - i) >= every)
  if (current !== null && current >= 1 && current <= count) shown.add(current - 1)
  if (fits(count - 1)) shown.add(count - 1)
  for (let i = 0; i < count; i += every) {
    if (fits(i)) shown.add(i)
  }
  return shown
}

/** The days before the race a plan can still be rebuilt: the API's rule too. */
const MIN_DAYS_BEFORE_RACE = 14

/** A plan can be rebuilt from today once it has started and while the race is at least two weeks away. */
export const canReplan = (plan: TrainingPlan, today: string) => today >= plan.startDate && today <= addDays(plan.race.date, -MIN_DAYS_BEFORE_RACE)

/** Race week: the seven days before the race, and race day itself. Race prep shows only then. */
export const inRaceWeek = (plan: TrainingPlan, today: string) => {
  const days = daysBetween(today, plan.race.date)
  return days >= 0 && days <= 7
}
