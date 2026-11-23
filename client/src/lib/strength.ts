import type { Session } from './types'

/** Strength is its own session, never part of a run: everything that lists a day's work splits on this. */
export const isStrength = (session: Pick<Session, 'type'>) => session.type === 'Strength'

/** How long a strength session takes, from the start of its detail ("About 30 min."), or null when it doesn't say. */
export function strengthMinutes(session: Pick<Session, 'detail'>): number | null {
  const match = /^About (\d+) min/.exec(session.detail)
  return match ? Number(match[1]) : null
}

/** "6 exercises · about 30 min": what a strength session asks for, in one line. */
export function strengthSummary(session: Pick<Session, 'detail' | 'exercises'>): string {
  const count = session.exercises.length
  const minutes = strengthMinutes(session)
  return `${count} ${count === 1 ? 'exercise' : 'exercises'}${minutes ? ` · about ${minutes} min` : ''}`
}
