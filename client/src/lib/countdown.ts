const DAY = 86_400_000

/** Whole days from one calendar date to another ("2026-10-08" to "2027-06-13" is 248). Negative once it's past. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)
}

/**
 * How far through its window something is, from 0 to 1: a plan from its first day to race day, or the home page's
 * countdown over the year before a race. Clamped, so before the start is 0 and race day (or later) is 1.
 */
export function progressBetween(start: string, end: string, today: string): number {
  const total = daysBetween(start, end)
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, daysBetween(start, today) / total))
}
