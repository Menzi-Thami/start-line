import type { CheckIn, Session } from '../../lib/types'
import { sessionKey } from './plan-math'

/** A day of an accepted recovery plan, outside the training plan's own dates. */
export interface RecoveryMark {
  title: string
  guidance: string
}

/**
 * What a calendar day is. Rest only exists inside the plan; a date outside it is neutral, unless the runner accepted a
 * recovery plan that covers it (then it's that plan's own day), or they recorded a run on it.
 */
export function dayStatus(sessions: readonly Session[], done: ReadonlySet<string>, entries: readonly CheckIn[], recorded: boolean, provisional = false, inPlan = true, recovery?: RecoveryMark | null) {
  const answers = entries.filter(entry => !entry.isAdditional)
  if (answers.some(entry => entry.status === 'CutShort')) return { kind: 'partial', icon: '−', label: sessions.length > 1 ? 'Mixed sessions · cut short' : 'Cut short' }
  if (answers.some(entry => entry.status === 'Skipped')) return { kind: 'skipped', icon: '–', label: sessions.length > 1 ? 'Mixed sessions · includes skipped workout' : 'Skipped' }
  if (provisional) return { kind: 'recorded', icon: '↗', label: 'Recorded via Strava · provisional' }
  if (sessions.length && sessions.every(session => done.has(sessionKey(session)))) return { kind: 'complete', icon: '✓', label: 'Completed' }
  if (!inPlan && !sessions.length && recovery) return { kind: 'recovery', icon: '◌', label: `Recovery: ${recovery.title}`, detail: recovery.guidance }
  if (recorded) return { kind: 'recorded', icon: '↗', label: 'Activity recorded' }
  if (!inPlan && !sessions.length) return { kind: 'outside', icon: '', label: 'Outside this plan' }
  if (!sessions.length) return { kind: 'rest', icon: '○', label: 'Rest day' }
  return { kind: 'planned', icon: '•', label: 'Scheduled' }
}
