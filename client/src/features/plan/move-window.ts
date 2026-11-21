import { addDays } from '../../lib/format'
import type { TrainingPlan } from '../../lib/types'

/** How far ahead a run can be changed, as the server's LifeHappens.HorizonDays. */
const HORIZON_DAYS = 14

const mondayOf = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return addDays(date, -((day + 6) % 7))
}

/**
 * The days a run can be moved from and to, exactly as the server allows (LifeHappens): the plan's week that holds today,
 * from today to its Sunday. Before the plan starts, its first week, from its Monday. Drags and "Move this run" use this, so
 * the app never offers a move the server would refuse (and never waits on one).
 */
export function moveWindow(plan: Pick<TrainingPlan, 'weeks'>, today: string): { first: string; last: string } {
  const week = plan.weeks.find(w => w.startDate <= today && today < addDays(w.startDate, 7))
  const firstWeek = plan.weeks[0]?.startDate
  const start = week?.startDate ?? (firstWeek && today < firstWeek ? firstWeek : mondayOf(today))
  return { first: today > start ? today : start, last: addDays(start, 6) }
}

/** A run on this day can be picked up and moved. */
export function canMoveFrom(plan: Pick<TrainingPlan, 'weeks'>, today: string, date: string): boolean {
  const { first, last } = moveWindow(plan, today)
  return date >= first && date <= last && date < addDays(today, HORIZON_DAYS)
}

/** A run can be dropped on this day. */
export function canMoveTo(plan: Pick<TrainingPlan, 'weeks'>, today: string, date: string): boolean {
  const { first, last } = moveWindow(plan, today)
  return date >= first && date <= last
}
