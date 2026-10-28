import type { PlanWeek, Session } from '../../lib/types'

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
