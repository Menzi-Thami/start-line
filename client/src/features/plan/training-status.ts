import type { CheckIn, Session } from '../../lib/types'
import { sessionKey } from './plan-math'

export function dayStatus(sessions: readonly Session[], done: ReadonlySet<string>, entries: readonly CheckIn[], recorded: boolean, provisional = false) {
  const answers = entries.filter(entry => !entry.isAdditional)
  if (answers.some(entry => entry.status === 'CutShort')) return { kind: 'partial', icon: '−', label: sessions.length > 1 ? 'Mixed sessions · cut short' : 'Cut short' }
  if (answers.some(entry => entry.status === 'Skipped')) return { kind: 'skipped', icon: '–', label: sessions.length > 1 ? 'Mixed sessions · includes skipped workout' : 'Skipped' }
  if (provisional) return { kind: 'recorded', icon: '↗', label: 'Recorded via Strava · provisional' }
  if (sessions.length && sessions.every(session => done.has(sessionKey(session)))) return { kind: 'complete', icon: '✓', label: 'Completed' }
  if (recorded) return { kind: 'recorded', icon: '↗', label: 'Activity recorded' }
  if (!sessions.length) return { kind: 'rest', icon: '○', label: 'Rest day' }
  return { kind: 'planned', icon: '•', label: 'Scheduled' }
}

