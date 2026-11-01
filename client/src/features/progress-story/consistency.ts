import type { ActivitySummary } from '../../lib/types'

export interface ConsistencyWeek { start: string; end: string; runs: number; days: number; km: number }
function dateOffset(date: string, offset: number): string {
  const d = new Date(date + 'T12:00:00Z')
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid calendar date')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
/** Two adjacent rolling seven-day windows; not calendar weeks or fitness predictions. */
export function consistencyWeeks(runs: readonly ActivitySummary[], today: string): { current: ConsistencyWeek; previous: ConsistencyWeek } {
  const summarize = (start: string, end: string): ConsistencyWeek => {
    const eligible = runs.filter(run => run.localDate >= start && run.localDate <= end && run.kind !== 'Other')
    const measured = eligible.filter(run => Number.isFinite(run.distanceKm) && run.distanceKm > 0)
    return { start, end, runs: eligible.length, days: new Set(eligible.map(run => run.localDate)).size,
      km: Math.round(measured.reduce((acc, run) => acc + run.distanceKm, 0) * 10) / 10 }
  }
  return { current: summarize(dateOffset(today, -6), today), previous: summarize(dateOffset(today, -13), dateOffset(today, -7)) }
}
export function consistencyNarrative(current: ConsistencyWeek, previous: ConsistencyWeek): string {
  if (current.runs === 0 && previous.runs === 0) return 'No runs recorded in either seven-day window yet.'
  if (previous.runs === 0) return 'You have recorded runs this week; there is no earlier week to compare.'
  if (current.days === previous.days) return 'You ran on the same number of recorded days as the previous seven days.'
  return `You ran on ${Math.abs(current.days - previous.days)} ${Math.abs(current.days - previous.days) === 1 ? 'day' : 'days'} ${current.days > previous.days ? 'more' : 'fewer'} than the previous seven days.`
}
