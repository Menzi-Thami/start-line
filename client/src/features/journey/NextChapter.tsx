import { useId, useState } from 'react'
import { formatDate } from '../../lib/format'
import { SHORT_DAY, WEEK, type DayOfWeek } from '../../lib/types'
import type { MaintenancePlan, StartMaintenance } from './types'

interface Props {
  runDays: DayOfWeek[]
  onMaintenance: (body: StartMaintenance) => Promise<unknown>
  /** Opens the plan builder. The saved plan is only replaced if the runner confirms it there. */
  onNewRace?: () => void
  /** More recovery: extends the current one, or starts one. */
  onMoreRecovery?: () => void
}

/**
 * The next chapter, as equal choices: keep running comfortably, train for another race, or more recovery. Nothing is
 * chosen for the runner and "not yet" is always fine.
 */
export function NextChapter({ runDays, onMaintenance, onNewRace, onMoreRecovery }: Props) {
  const id = useId()
  const [open, setOpen] = useState<'maintenance' | null>(null)
  const [notYet, setNotYet] = useState(false)
  return (
    <section className="next-chapter" aria-labelledby={`${id}-title`}>
      <p className="plan-kicker">What’s next?</p>
      <h3 id={`${id}-title`} className="next-chapter-title">Choose your next chapter.</h3>
      <div className="next-chapter-choices">
        <button type="button" className="next-chapter-choice" aria-expanded={open === 'maintenance'} onClick={() => setOpen(open === 'maintenance' ? null : 'maintenance')}>
          <strong>Keep running comfortably</strong>
          <span>Two to four easy runs a week. No race date, no hard sessions.</span>
        </button>
        {onNewRace && (
          <button type="button" className="next-chapter-choice" onClick={onNewRace}>
            <strong>Train for another race</strong>
            <span>Build a new plan. Your history stays, and nothing is replaced unless you say so.</span>
          </button>
        )}
        {onMoreRecovery && (
          <button type="button" className="next-chapter-choice" onClick={onMoreRecovery}>
            <strong>I need more recovery</strong>
            <span>Take more gentle days. There’s no deadline.</span>
          </button>
        )}
      </div>
      {open === 'maintenance' && <MaintenanceForm runDays={runDays} onStart={onMaintenance} onCancel={() => setOpen(null)} />}
      {!notYet
        ? <button type="button" className="link-button journey-link" onClick={() => setNotYet(true)}>Not ready to choose yet</button>
        : <p className="field-help" role="status">That’s fine. These choices stay here until you want them.</p>}
    </section>
  )
}

function MaintenanceForm({ runDays, onStart, onCancel }: { runDays: DayOfWeek[]; onStart: (body: StartMaintenance) => Promise<unknown>; onCancel: () => void }) {
  const id = useId()
  const initialDays = runDays.length >= 2 ? runDays.slice(0, 4) : (['Tuesday', 'Thursday', 'Saturday'] as DayOfWeek[])
  const [days, setDays] = useState<DayOfWeek[]>(initialDays.slice(0, 3))
  const [strength, setStrength] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = (day: DayOfWeek) => setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b)))
  const start = async () => {
    if (days.length < 2 || days.length > 4) { setError('Choose two to four days.'); return }
    setBusy(true)
    setError(null)
    try {
      await onStart({ daysPerWeek: days.length, runDays: days, includeStrength: strength })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Maintenance couldn’t start. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="maintenance-form">
      <fieldset className="journey-choice">
        <legend className="field-label">Which days suit you? <span className="field-help">(two to four)</span></legend>
        {WEEK.map(day => (
          <label key={day} className="journey-chip is-day">
            <input type="checkbox" checked={days.includes(day)} onChange={() => toggle(day)} />
            <span>{SHORT_DAY[day]}</span>
          </label>
        ))}
      </fieldset>
      <label className="session-done" htmlFor={`${id}-strength`}>
        <input id={`${id}-strength`} type="checkbox" checked={strength} onChange={e => setStrength(e.target.checked)} />
        Add an optional strength session
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="journey-actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={() => void start()}>{busy ? 'Starting…' : 'Start easy running'}</button>
        <button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

const MAINTENANCE_WORDS = { EasyRun: 'Easy run', LongerEasyRun: 'Longer easy run', Strength: 'Strength' } as const

/** Maintenance: this week's easy, optional sessions, with no race and nothing to miss. */
export function MaintenanceCard({ maintenance, today, onEnd, onNewRace, compact = false }: {
  maintenance: MaintenancePlan
  today: string
  onEnd: () => Promise<unknown>
  onNewRace?: () => void
  compact?: boolean
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessions = maintenance.weeks.flatMap(week => week.sessions)
  const upcoming = sessions.filter(session => session.date >= today)
  const shown = compact ? upcoming.slice(0, 3) : maintenance.weeks[0]?.sessions ?? []
  const end = async () => {
    setBusy(true)
    setError(null)
    try { await onEnd() } catch (reason) { setError(reason instanceof Error ? reason.message : 'That didn’t save. Try again.') } finally { setBusy(false) }
  }
  return (
    <section className="maintenance" aria-labelledby={`${id}-title`}>
      <p className="plan-kicker">Keep running comfortably</p>
      <h3 id={`${id}-title`} className="maintenance-title">{maintenance.daysPerWeek} easy runs a week</h3>
      <p className="field-help">Conversational effort. Every session is optional; move them around as life needs.</p>
      <ul className="maintenance-sessions" aria-label={compact ? 'Coming up' : 'This week'}>
        {shown.map(session => (
          <li key={`${session.date}|${session.kind}`} className={session.date < today ? 'is-past' : session.date === today ? 'is-today' : undefined}>
            <span className="mono">{formatDate(session.date, 'weekday')} {formatDate(session.date, 'dayMonth')}</span>
            <strong>{MAINTENANCE_WORDS[session.kind]}</strong>
            <span className="mono">{session.minMinutes}–{session.maxMinutes} min</span>
          </li>
        ))}
      </ul>
      {!compact && (
        <div className="journey-actions">
          {onNewRace && <button type="button" className="button" onClick={onNewRace}>Train for another race</button>}
          {!confirm && <button type="button" className="button button-quiet" onClick={() => setConfirm(true)}>Stop maintenance</button>}
        </div>
      )}
      {confirm && (
        <div className="journey-confirm" role="group" aria-label="Stop maintenance">
          <p>Stop your easy-running schedule? Your runs and history stay.</p>
          <button type="button" className="button" disabled={busy} onClick={() => void end()}>{busy ? 'Stopping…' : 'Stop'}</button>
          <button type="button" className="button button-quiet" onClick={() => setConfirm(false)}>Keep it</button>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  )
}
