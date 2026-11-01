import type { ActivitySummary } from '../../lib/types'

export interface TrainingWindow {
  from: string
  to: string
  runs: number
  km: number
  activeDays: number
  missingDistance: number
}

function offset(date: string, days: number): string {
  const value = new Date(date + 'T12:00:00Z')
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid date')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function trainingWindows(runs: readonly ActivitySummary[], today: string): { current: TrainingWindow; previous: TrainingWindow } {
  const summarize = (from: string, to: string): TrainingWindow => {
    const selected = runs.filter(run => run.localDate >= from && run.localDate <= to && run.kind !== 'Other')
    const measured = selected.filter(run => Number.isFinite(run.distanceKm) && run.distanceKm > 0)
    return {
      from, to, runs: selected.length,
      km: Math.round(measured.reduce((sum, run) => sum + run.distanceKm, 0) * 10) / 10,
      activeDays: new Set(selected.map(run => run.localDate)).size,
      missingDistance: selected.length - measured.length,
    }
  }
  return {
    current: summarize(offset(today, -27), today),
    previous: summarize(offset(today, -55), offset(today, -28)),
  }
}

export function trainingTrend(current: TrainingWindow, previous: TrainingWindow): string {
  if (!previous.runs) return 'Not enough earlier run records to compare.'
  if (current.missingDistance || previous.missingDistance) return 'Some recorded runs have no measured distance, so distance comparisons may be incomplete.'
  if (previous.km === 0) return 'No measured distance in the previous period.'
  const delta = Math.round(((current.km - previous.km) / previous.km) * 100)
  if (Math.abs(delta) < 5) return 'Recorded distance is similar to the previous 28 days.'
  return `Recorded distance is ${Math.abs(delta)}% ${delta > 0 ? 'higher' : 'lower'} than the previous 28 days.`
}
