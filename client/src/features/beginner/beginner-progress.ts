import type { BeginnerSession } from './couch-to-5k'

export type BeginnerDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
export const BEGINNER_DAYS: readonly BeginnerDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export interface BeginnerProgress {
  startedOn: string
  days: readonly [BeginnerDay, BeginnerDay, BeginnerDay]
  completed: readonly string[]
  week: number
  paused: boolean
  revision: number
  /** Extra days applied from this week onward; repeating a week adds seven. */
  weekDelays?: readonly number[]
  pausedOn?: string | null
}
const iso = (value: Date) => value.toISOString().slice(0, 10)
const dayOffset = (day: BeginnerDay) => BEGINNER_DAYS.indexOf(day)

export function validRunDays(days: readonly BeginnerDay[]): boolean {
  if (days.length !== 3 || new Set(days).size !== 3) return false
  const sorted = days.map(dayOffset).sort((a, b) => a - b)
  return sorted.every((day, i) => ((sorted[(i + 1) % 3]! - day + 7) % 7) >= 2)
}

export function sessionId(session: Pick<BeginnerSession, 'week' | 'day'>, revision = 0): string {
  return `${revision}:${session.week}:${session.day}`
}

export function sessionDate(startedOn: string, days: readonly BeginnerDay[], week: number, day: number): string {
  const start = new Date(`${startedOn}T12:00:00Z`)
  if (Number.isNaN(start.getTime())) throw new Error('Invalid programme start date')
  const first = (start.getUTCDay() + 6) % 7
  const offsets = days.map(dayOffset).map(offset => (offset - first + 7) % 7).sort((a, b) => a - b)
  const result = new Date(start)
  result.setUTCDate(result.getUTCDate() + (week - 1) * 7 + offsets[day - 1]!)
  return iso(result)
}

/** Calendar-day arithmetic in UTC avoids local daylight-saving time jumps. */
export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(value.getTime())) throw new Error('Invalid calendar date')
  value.setUTCDate(value.getUTCDate() + days)
  return iso(value)
}

export function beginnerDate(progress: BeginnerProgress, week: number, day: number): string {
  const delay = (progress.weekDelays ?? []).slice(0, week).reduce((sum, d) => sum + d, 0)
  return addCalendarDays(sessionDate(progress.startedOn, progress.days, week, day), delay)
}

export function repeatBeginnerWeek(progress: BeginnerProgress): BeginnerProgress {
  const delays = Array.from({ length: 9 }, (_, i) => progress.weekDelays?.[i] ?? 0)
  delays[progress.week - 1] = (delays[progress.week - 1] ?? 0) + 7
  const current = `:${progress.week}:`
  return { ...progress, weekDelays: delays, completed: progress.completed.filter(id => !id.includes(current)), paused: false, pausedOn: null }
}

export function resumeBeginnerProgress(progress: BeginnerProgress, today: string): BeginnerProgress {
  if (!progress.paused) return progress
  const from = progress.pausedOn ?? today
  const elapsed = Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000))
  const delays = Array.from({ length: 9 }, (_, i) => progress.weekDelays?.[i] ?? 0)
  delays[progress.week - 1] = (delays[progress.week - 1] ?? 0) + elapsed
  return { ...progress, paused: false, pausedOn: null, weekDelays: delays }
}

export function countCompleted(progress: BeginnerProgress, sessions: readonly BeginnerSession[]): number {
  const completed = new Set(progress.completed)
  return sessions.filter(session => completed.has(sessionId(session, progress.revision))).length
}

export function defaultBeginnerProgress(today: string): BeginnerProgress {
  return { startedOn: today, days: ['Monday', 'Wednesday', 'Friday'], completed: [], week: 1, paused: false, revision: 0, weekDelays: Array(9).fill(0), pausedOn: null }
}

/** Untrusted browser storage should never be allowed to invent a session or schedule. */
export function parseBeginnerProgress(raw: string | null, today: string): BeginnerProgress {
  if (!raw) return defaultBeginnerProgress(today)
  try {
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return defaultBeginnerProgress(today)
    const candidate = p as Partial<BeginnerProgress>
    if (!candidate.startedOn || !/^\d{4}-\d\d-\d\d$/.test(candidate.startedOn) ||
        !Array.isArray(candidate.days) || !candidate.days.every(d => BEGINNER_DAYS.includes(d)) ||
        !validRunDays(candidate.days) || !Array.isArray(candidate.completed) ||
        !candidate.completed.every(id => typeof id === 'string' && /^\d+:([1-9]):[123]$/.test(id)) ||
        !Number.isInteger(candidate.week) || candidate.week! < 1 || candidate.week! > 9 ||
        !Number.isInteger(candidate.revision) || candidate.revision! < 0 ||
        typeof candidate.paused !== 'boolean' ||
        (candidate.weekDelays !== undefined && (!Array.isArray(candidate.weekDelays) || candidate.weekDelays.length !== 9 || !candidate.weekDelays.every(d => Number.isInteger(d) && d >= 0 && d <= 3650))) ||
        (candidate.pausedOn != null && (typeof candidate.pausedOn !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(candidate.pausedOn)))) return defaultBeginnerProgress(today)
    return candidate as BeginnerProgress
  } catch { return defaultBeginnerProgress(today) }
}
