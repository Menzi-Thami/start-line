import type { ActivitySummary } from '../../lib/types'

export function comparablePaceGroups(runs: readonly ActivitySummary[], from: string, today: string) {
  const groups = new Map<string, ActivitySummary[]>()
  for (const run of runs) {
    if (!['Easy', 'Recovery'].includes(run.plannedSessionType ?? '') || run.localDate < from || run.localDate > today ||
      !Number.isFinite(run.distanceKm) || run.distanceKm < 1 || !Number.isFinite(run.paceSecondsPerKm) || run.paceSecondsPerKm <= 0 || run.movingSeconds < 300) continue
    const key = `${run.plannedSessionType} · about ${Math.round(run.distanceKm)} km · ${run.source.kind}`
    groups.set(key, [...groups.get(key) ?? [], run])
  }
  return [...groups].map(([label, records]) => ({ label, records: records.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => b.records.length - a.records.length || a.label.localeCompare(b.label))
}

export function calendarDaysEnding(today: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(`${today}T12:00:00Z`)
    day.setUTCDate(day.getUTCDate() - (count - 1 - index))
    return day.toISOString().slice(0, 10)
  })
}
