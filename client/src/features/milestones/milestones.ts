import type { ActivitySummary } from '../../lib/types'

export type Milestone = {
  id: string
  type: 'longest' | 'consistency' | 'weekly-distance'
  title: string
  value: number
  unit: 'km' | 'weeks'
  detail: string
  evidenceCount: number
}

function validCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Milestones are derived from visible records, never claimed as all-time personal bests. */
export function milestonesFromRuns(runs: readonly ActivitySummary[]): Milestone[] {
  const valid = runs.filter(run =>
    Number.isFinite(run.distanceKm) && run.distanceKm > 0 &&
    validCalendarDay(run.localDate))
  if (valid.length === 0) return []
  const sorted = [...valid].sort((a, b) => b.localDate.localeCompare(a.localDate) || a.id.localeCompare(b.id))
  const longest = sorted.reduce((best, next) => next.distanceKm > best.distanceKm ? next : best)
  const items: Milestone[] = [{
    id: 'longest', type: 'longest', title: 'Longest run in your records',
    value: Math.round(longest.distanceKm * 10) / 10, unit: 'km',
    detail: `Recorded on ${longest.localDate}. Based on runs currently available in Taperday.`,
    evidenceCount: valid.length,
  }]
  // Use UTC calendar arithmetic, not local time or an activity timestamp, to avoid TZ/DST week drift.
  const weekStart = (date: string) => {
    const day = new Date(`${date}T12:00:00Z`)
    const offset = (day.getUTCDay() + 6) % 7
    day.setUTCDate(day.getUTCDate() - offset)
    return day.toISOString().slice(0, 10)
  }
  const weeks = new Map<string, number>()
  for (const run of valid) {
    const key = weekStart(run.localDate)
    weeks.set(key, (weeks.get(key) ?? 0) + run.distanceKm)
  }
  const biggest = [...weeks].sort((a, b) => b[1] - a[1])[0]
  if (biggest) items.push({
    id: 'weekly-distance', type: 'weekly-distance', title: 'Biggest recorded week',
    value: Math.round(biggest[1] * 10) / 10, unit: 'km',
    detail: `Week of ${biggest[0]}; from the run records currently available.`,
    evidenceCount: valid.length,
  })
  const descending = [...weeks.keys()].sort().reverse()
  if (descending.length) {
    let streak = 1
    let cursor = new Date(`${descending[0]}T12:00:00Z`)
    for (const prior of descending.slice(1)) {
      cursor.setUTCDate(cursor.getUTCDate() - 7)
      if (cursor.toISOString().slice(0, 10) !== prior) break
      streak++
    }
    if (streak >= 2) items.push({
      id: 'consistency', type: 'consistency', title: 'Consecutive recorded weeks',
      value: streak, unit: 'weeks',
      detail: `A run in each week ending at ${descending[0]}. Not necessarily your current or longest-ever streak.`,
      evidenceCount: valid.length,
    })
  }
  return items
}
