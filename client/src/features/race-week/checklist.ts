/** Race-specific, device-local checklist. No server profile or training data is changed. */
export type RaceTask = { id: string; label: string; group: 'before' | 'day' }
export const RACE_TASKS: readonly RaceTask[] = [
  { id: 'start', label: 'Confirm start time, location and race number', group: 'before' },
  { id: 'route', label: 'Review course, forecast and transport', group: 'before' },
  { id: 'kit', label: 'Lay out familiar shoes, kit and race essentials', group: 'before' },
  { id: 'fuel', label: 'Plan familiar food, fluids and your pacing approach', group: 'before' },
  { id: 'travel', label: 'Allow time to get to the start', group: 'day' },
  { id: 'warmup', label: 'Follow your usual warm-up and race plan', group: 'day' },
] as const
export function raceChecklistKey(date: string, name: string): string {
  return 'taperday:race-week:v1:' + encodeURIComponent(date + ':' + name.trim().toLowerCase())
}
export function completedTasks(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string =>
      typeof item === 'string' && RACE_TASKS.some(task => task.id === item)))] : []
  } catch { return [] }
}
