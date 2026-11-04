import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { Session } from '../../lib/types'
import type { dayStatus } from './training-status'

export function DayPreview({ date, sessions, status, units, onOpen, id }: {
  date: string; sessions: readonly Session[]; status: ReturnType<typeof dayStatus>; units: Units; onOpen: () => void; id: string
}) {
  return <section id={id} className="day-preview panel" aria-label="Selected day preview" aria-live="polite">
    <p className="plan-kicker">{formatDate(date, 'long')}</p>
    <h3>{sessions.length ? sessions.map(session => session.title).join(' + ') : 'Rest day'}</h3>
    <p className={`training-status is-${status.kind}`}><span aria-hidden="true">{status.icon}</span> {status.label}{sessions.length > 1 ? ` · ${sessions.length} sessions` : ''}</p>
    {sessions.some(session => session.distanceKm > 0) && <p className="mono">{formatDistance(sessions.reduce((km, session) => km + session.distanceKm, 0), units)} planned</p>}
    <p>{sessions[0]?.purpose || (sessions.length ? sessions[0]?.detail : 'Take time to recover. Any recorded activity stays separate from your prescription.')}</p>
    <button type="button" className="button button-primary" onClick={onOpen}>Open day details <span aria-hidden="true">→</span></button>
  </section>
}
