import type { PlanWeek, Session } from '../../lib/types'

/** Race week shows its training only; the race itself would dwarf every other bar. */
export const trainingKm = (week: PlanWeek) =>
  Math.round(week.sessions.filter((s) => s.type !== 'Race').reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10

export const sessionKey = (s: Session) => `${s.date}|${s.type}`
