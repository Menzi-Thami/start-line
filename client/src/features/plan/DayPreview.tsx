import './training-status.css'
import { formatDate, formatDistance, formatPaceRange, type Units } from '../../lib/format'
import type { Session, TrainingPlan } from '../../lib/types'
import type { dayStatus } from './training-status'
import { SessionSteps } from './SessionSteps'
import { isStrength, strengthSummary } from '../../lib/strength'

/**
 * The selected day beside the week. On a phone it's a short preview under the strip; on a desktop it fills the second
 * column with each session's distance, pace and structure, so the week and the day read side by side.
 */
export function DayPreview({ date, sessions, status, units, onOpen, id, paces }: {
  date: string; sessions: readonly Session[]; status: ReturnType<typeof dayStatus>; units: Units; onOpen: () => void; id: string
  paces?: TrainingPlan['paces']
}) {
  // The day reads as its run; strength on the same day sits in its own block underneath, never inside the run.
  const runs = sessions.filter(session => !isStrength(session))
  const strength = sessions.filter(isStrength)
  const headline = runs.length ? runs : sessions
  return <section id={id} className="day-preview panel" aria-label="Selected day preview" aria-live="polite">
    <p className="plan-kicker">{formatDate(date, 'long')}</p>
    <h3>{sessions.length ? headline.map(session => session.title).join(' + ') : status.kind === 'recovery' ? status.label : status.kind === 'outside' ? 'Outside this plan' : 'Rest day'}</h3>
    <p className={`training-status is-${status.kind}`}><span aria-hidden="true">{status.icon}</span> {status.label}{sessions.length > 1 ? ` · ${sessions.length} sessions` : ''}</p>
    {sessions.some(session => session.distanceKm > 0) && <p className="mono">{formatDistance(sessions.reduce((km, session) => km + session.distanceKm, 0), units)} planned</p>}
    <p>{sessions[0]?.purpose || (sessions.length ? sessions[0]?.detail : status.kind === 'recovery' ? status.detail : status.kind === 'outside' ? 'This date is not part of your training schedule. Any recorded activity stays in your running history.' : 'Take time to recover. Any recorded activity stays separate from your prescription.')}</p>
    {runs.length > 0 && <div className="day-preview-structure">
      {runs.map((session, i) => {
        const pace = paces?.find(p => p.zone === session.zone)
        return <div key={`${session.type}|${i}`} className="day-preview-session">
          <p className="day-preview-session-title"><strong>{session.title}</strong>{session.distanceKm > 0 && <span className="mono"> · {formatDistance(session.distanceKm, units)}{pace ? ` · ${formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units)}` : ''}</span>}</p>
          <SessionSteps steps={session.steps} units={units} />
        </div>
      })}
    </div>}
    {strength.map(session => <div key={`${session.date}|${session.type}`} className="day-preview-strength" aria-label={`Strength: ${session.title}`}>
      <p className="plan-kicker">Strength{runs.length ? ' · after your run' : ''}</p>
      <p className="day-preview-session-title"><strong>{session.title}</strong></p>
      <p className="field-help">{strengthSummary(session)}</p>
    </div>)}
    <button type="button" className="button button-primary" onClick={onOpen}>Open day details <span aria-hidden="true">→</span></button>
  </section>
}
