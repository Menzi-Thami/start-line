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

export function countCompleted(progress: BeginnerProgress, sessions: readonly BeginnerSession[]): number {
  const completed = new Set(progress.completed)
  return sessions.filter(session => completed.has(sessionId(session, progress.revision))).length
}

export function defaultBeginnerProgress(today: string): BeginnerProgress {
  return { startedOn: today, days: ['Monday', 'Wednesday', 'Friday'], completed: [], week: 1, paused: false, revision: 0 }
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
        typeof candidate.paused !== 'boolean') return defaultBeginnerProgress(today)
    return candidate as BeginnerProgress
  } catch { return defaultBeginnerProgress(today) }
}
