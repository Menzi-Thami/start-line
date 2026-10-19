import type { Exercise, Session } from '../../lib/types'
import { sessionKey } from '../plan/plan-math'

// Ticks live in the plan's one "done" set (saved per device): a session's own key, plus one key per set of each of
// its exercises. A strength session is done exactly when every set is: ticking the last set ticks the session, and
// ticking the session ticks every set, so the week list and the Strength tab always agree.

export type DoneUpdate = (done: Set<string>) => Set<string>

export const setKey = (session: Session, exercise: Exercise, set: number) => `${sessionKey(session)}|${exercise}|${set}`

const allSetKeys = (session: Session) =>
  session.exercises.flatMap((e) => Array.from({ length: e.sets }, (_, i) => setKey(session, e.exercise, i)))

export function withSessionDone(done: Set<string>, session: Session, isDone: boolean): Set<string> {
  const next = new Set(done)
  for (const key of [sessionKey(session), ...allSetKeys(session)]) {
    if (isDone) next.add(key)
    else next.delete(key)
  }
  return next
}

export function withSetDone(done: Set<string>, session: Session, exercise: Exercise, set: number, isDone: boolean): Set<string> {
  const next = new Set(done)
  if (isDone) next.add(setKey(session, exercise, set))
  else next.delete(setKey(session, exercise, set))
  const sets = allSetKeys(session)
  if (sets.length > 0 && sets.every((k) => next.has(k))) next.add(sessionKey(session))
  else next.delete(sessionKey(session))
  return next
}

export function setsDone(done: Set<string>, session: Session): { done: number; total: number } {
  const sets = allSetKeys(session)
  return { done: sets.filter((k) => done.has(k)).length, total: sets.length }
}
