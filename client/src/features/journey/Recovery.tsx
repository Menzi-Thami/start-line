import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { formatDate } from '../../lib/format'
import { SHORT_DAY, WEEK, type DayOfWeek } from '../../lib/types'
import { Runner } from '../shared/Runner'
import { isPastRecovery, recoveryDayNumber, weekOf } from './journey-model'
import { FEELINGS, framingFor, RED_FLAGS, SAFETY_WORDS } from './recovery-copy'
import type {
  ChangeRecovery,
  RecoveryDay,
  RecoveryEffort,
  RecoveryFeeling,
  RecoveryPlan,
  RecoveryPreference,
  RecoveryRedFlag,
  StartRecovery,
} from './types'

const EFFORTS: { value: RecoveryEffort; label: string; help: string }[] = [
  { value: 'Easy', label: 'Comfortable', help: 'Ran it within myself' },
  { value: 'Hard', label: 'Hard', help: 'A proper race effort' },
  { value: 'AllOut', label: 'All out', help: 'Left everything out there' },
]

const PREFERENCES: { value: RecoveryPreference; label: string }[] = [
  { value: 'Rest', label: 'Mostly rest' },
  { value: 'Walk', label: 'Walks' },
  { value: 'CrossTraining', label: 'Gentle cross-training' },
  { value: 'EasyRunning', label: 'Easy running when I’m ready' },
]

interface OfferProps {
  /** The race this follows; absent for a race run outside a Taperday plan. */
  planId?: string | null
  eventName?: string
  distanceKm?: number | null
  raceDate?: string | null
  today: string
  runDays: DayOfWeek[]
  onStart: (body: StartRecovery) => Promise<unknown>
  onDecline?: () => void
}

/**
 * The recovery offer after a race the runner actually ran. Everything is optional and adjustable, and saying "Not now"
 * leaves Home and the plan exactly as they are. Red flags turn it into safety advice, not exercise.
 */
export function RecoveryOffer({ planId, eventName = '', distanceKm, raceDate, today, runDays, onStart, onDecline }: OfferProps) {
  const id = useId()
  const manual = !planId
  const [name, setName] = useState(eventName)
  const [distance, setDistance] = useState(distanceKm != null ? String(distanceKm) : '')
  const [date, setDate] = useState(raceDate && raceDate <= today ? raceDate : today)
  const [effort, setEffort] = useState<RecoveryEffort>('Hard')
  const [preference, setPreference] = useState<RecoveryPreference>('Walk')
  const [feeling, setFeeling] = useState<RecoveryFeeling | null>(null)
  const [flags, setFlags] = useState<RecoveryRedFlag[]>([])
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const km = Number(distance)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!Number.isFinite(km) || km <= 0 || km > 400) { setError('Add the race distance in kilometres.'); return }
    if (date > today) { setError('Recovery starts from a race you’ve already run.'); return }
    setBusy(true)
    setError(null)
    try {
      await onStart({ planId: planId ?? null, eventName: name.trim() || null, distanceKm: km, raceDate: date, effort, preference, runDays, feeling, redFlags: flags })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your recovery couldn’t start. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="recovery-offer" onSubmit={(event) => void submit(event)} aria-labelledby={`${id}-title`} noValidate>
      <p className="plan-kicker">Recovery</p>
      <h3 id={`${id}-title`} className="recovery-title">{manual ? 'Recovering from another race?' : 'Want a gentle recovery plan?'}</h3>
      <p>Rest, walks and easy movement, shaped by how you feel each day. Nothing is compulsory, and a rest day always counts.</p>
      {Number.isFinite(km) && km > 0 && <p className="field-help">{framingFor(km)} Every body is different.</p>}
      {manual && (
        <div className="recovery-offer-race">
          <label className="field" htmlFor={`${id}-name`}><span className="field-label">Race name (optional)</span>
            <input id={`${id}-name`} className="input" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="field" htmlFor={`${id}-km`}><span className="field-label">Distance (km)</span>
            <input id={`${id}-km`} className="input mono" inputMode="decimal" value={distance} onChange={e => setDistance(e.target.value)} /></label>
          <label className="field" htmlFor={`${id}-date`}><span className="field-label">Race date</span>
            <input id={`${id}-date`} className="input" type="date" max={today} value={date} onChange={e => setDate(e.target.value)} /></label>
        </div>
      )}
      <p className="field-help">Starts gently. Running waits until you feel ready.</p>
      <details className="recovery-preferences" open={preferencesOpen} onToggle={event => setPreferencesOpen(event.currentTarget.open)}>
      <summary>Adjust recovery preferences</summary>
      {preferencesOpen && <>
      <fieldset className="journey-choice">
        <legend className="field-label">How hard was it?</legend>
        {EFFORTS.map(option => (
          <label key={option.value} className="journey-chip">
            <input type="radio" name={`${id}-effort`} checked={effort === option.value} onChange={() => setEffort(option.value)} />
            <span>{option.label}<small>{option.help}</small></span>
          </label>
        ))}
      </fieldset>
      <fieldset className="journey-choice">
        <legend className="field-label">What would you like on the easier days?</legend>
        {PREFERENCES.map(option => (
          <label key={option.value} className="journey-chip">
            <input type="radio" name={`${id}-preference`} checked={preference === option.value} onChange={() => setPreference(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="journey-choice">
        <legend className="field-label">How do you feel right now? <span className="field-help">(optional)</span></legend>
        {FEELINGS.map(option => (
          <label key={option.value} className="journey-chip">
            <input type="radio" name={`${id}-feeling`} checked={feeling === option.value} onChange={() => setFeeling(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      </>}
      </details>
      <RedFlagPicker flags={flags} onChange={setFlags} />
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="journey-actions">
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Starting…' : 'Start my recovery'}</button>
        {onDecline && <button type="button" className="button button-quiet" onClick={onDecline}>Not now</button>}
      </div>
    </form>
  )
}

function RedFlagPicker({ flags, onChange }: { flags: RecoveryRedFlag[]; onChange: (flags: RecoveryRedFlag[]) => void }) {
  const [open, setOpen] = useState(flags.length > 0)
  return (
    <>
    <details className="recovery-flags" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Anything worrying? <span className="field-help">Pain, swelling, dizziness…</span></summary>
      {open && <fieldset>
        <legend className="visually-hidden">Warning signs</legend>
        {RED_FLAGS.map(flag => (
          <label key={flag.value} className="session-done">
            <input type="checkbox" checked={flags.includes(flag.value)}
              onChange={e => onChange(e.target.checked ? [...flags, flag.value] : flags.filter(f => f !== flag.value))} />
            {flag.label}
          </label>
        ))}
      </fieldset>}
    </details>
    {flags.length > 0 && <p className="recovery-safety" role="alert">{SAFETY_WORDS}</p>}
    </>
  )
}

const KIND_WORDS: Record<RecoveryDay['kind'], string> = {
  RaceDay: 'Race day',
  Rest: 'Rest',
  Walk: 'Walk',
  Mobility: 'Mobility',
  CrossTraining: 'Cross',
  EasyRun: 'Easy run',
  SeekCare: 'Check',
  Paused: 'Paused',
}

const minutes = (day: RecoveryDay) => day.minMinutes != null && day.maxMinutes != null ? `${day.minMinutes}–${day.maxMinutes} min` : null

interface DashboardProps {
  recovery: RecoveryPlan
  today: string
  onCheckIn: (feeling: RecoveryFeeling, redFlags: RecoveryRedFlag[]) => Promise<unknown>
  onChange: (change: ChangeRecovery) => Promise<unknown>
  /** Shown once the runner says they're recovered: maintenance or another race. */
  next?: ReactNode
  compact?: boolean
}

/**
 * Recovery as its own state: the day count from the race, today's optional idea, a check-in that decides what comes
 * next, the recovery week (only its own days are marked), and pause, extend, end. No completion percentage, no missed
 * sessions, no streaks.
 */
export function RecoveryDashboard({ recovery, today, onCheckIn, onChange, next, compact = false }: DashboardProps) {
  const id = useId()
  const [flags, setFlags] = useState<RecoveryRedFlag[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const dayNumber = recoveryDayNumber(recovery.raceDate, today)
  const day = recovery.days.find(d => d.date === today) ?? null
  const done = isPastRecovery(recovery, today)
  const checkedToday = recovery.checkIns.find(c => c.date === today) ?? null
  const paused = recovery.status === 'Paused'
  const finished = recovery.status === 'Completed' || recovery.status === 'Ended'
  const resting = !day || day.kind === 'Rest' || day.kind === 'RaceDay' || day.kind === 'SeekCare' || day.kind === 'Paused'

  const run = async (label: string, work: () => Promise<unknown>, after?: string) => {
    if (busy) return
    setBusy(label)
    setError(null)
    setMessage(null)
    try {
      await work()
      if (after) setMessage(after)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That didn’t save. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const checkIn = (feeling: RecoveryFeeling) => run(feeling, () => onCheckIn(feeling, flags),
    feeling === 'GoodToGo' ? 'Thanks. Easy movement is open to you when you want it.' : feeling === 'PainOrInjury' ? 'Thanks for telling us. Please get it checked before you exercise.' : 'Thanks. Recovery stays gentle until you feel ready.')

  if (finished) {
    return (
      <section className="recovery is-finished" aria-labelledby={`${id}-title`}>
        <p className="plan-kicker">Recovery · {recovery.eventName}</p>
        <h3 id={`${id}-title`} className="recovery-title">{recovery.status === 'Completed' ? 'You’re recovered. What’s next?' : 'Recovery ended'}</h3>
        <p>{recovery.status === 'Completed' ? 'Choose your next chapter, or take more time. Nothing changes until you choose.' : 'You can start again any time you feel you need it.'}</p>
        {next}
      </section>
    )
  }

  return (
    <section className={`recovery${compact ? ' is-compact' : ''}${recovery.seekCare ? ' is-seek-care' : ''}`} aria-labelledby={`${id}-title`}>
      <div className="recovery-head">
        <Runner pose={resting ? 'sleep' : 'crouch'} size={resting ? 30 : 40} className="recovery-runner" />
        <div>
          <p className="plan-kicker">Recovery · {dayNumber <= 0 ? 'race day' : `day ${dayNumber}`}</p>
          <h3 id={`${id}-title`} className="recovery-title">{recovery.seekCare ? 'Let’s get that checked' : paused ? 'Recovery paused' : done ? 'Your recovery days are done' : 'Rest is training too.'}</h3>
        </div>
      </div>
      {recovery.seekCare && <p className="recovery-safety" role="alert">{recovery.safetyMessage ?? SAFETY_WORDS}</p>}
      {paused && <p className="field-help">Nothing is suggested while recovery is paused. Resume whenever you like; it picks up where you left it.</p>}
      {!paused && !recovery.seekCare && day && !done && (
        <div className="recovery-today">
          <p className="field-help">Today’s idea{day.optional ? ' · optional' : ''}</p>
          <p className="recovery-today-title">{day.title}{minutes(day) && <span className="mono"> · {minutes(day)}</span>}</p>
          <p>{day.guidance}</p>
        </div>
      )}
      {done && !recovery.seekCare && !paused && (
        <p>{recovery.canComplete ? 'You said you’re good to go. Mark yourself recovered when it feels right, or take a few more days.' : 'Check in when you’re ready. There’s no rush, and more days are always fine.'}</p>
      )}
      {!paused && (
        <div className="recovery-checkin" role="group" aria-labelledby={`${id}-feel`}>
          <p id={`${id}-feel`} className="field-label">How is your body feeling{checkedToday ? ' now' : ' today'}?</p>
          <div className="recovery-feelings">
            {FEELINGS.map(option => (
              <button key={option.value} type="button" className={`button${option.value === 'GoodToGo' ? ' button-primary' : ''}`}
                aria-pressed={checkedToday?.feeling === option.value} disabled={!!busy} onClick={() => void checkIn(option.value)}>
                {busy === option.value ? 'Saving…' : option.label}
              </button>
            ))}
          </div>
          {!compact && <RedFlagPicker flags={flags} onChange={setFlags} />}
        </div>
      )}
      {!compact && <RecoveryWeek recovery={recovery} today={today} />}
      {!compact && recovery.checkIns.length > 0 && (
        <div className="recovery-trend">
          <p className="field-label">How you’ve been recovering</p>
          <ol aria-label="Recent check-ins">
            {recovery.checkIns.slice(-7).map(entry => (
              <li key={entry.date} className={`is-${entry.feeling}`}><span className="mono">{formatDate(entry.date, 'dayMonth')}</span> {FEELINGS.find(f => f.value === entry.feeling)?.label}</li>
            ))}
          </ol>
        </div>
      )}
      <p className="field-help">{framingFor(recovery.distanceKm)} Every body is different, and more days are always fine.</p>
      {!compact && (
        <div className="journey-actions">
          {recovery.canComplete && <button type="button" className="button button-primary" disabled={!!busy} onClick={() => void run('complete', () => onChange({ action: 'Complete', expectedVersion: recovery.version }))}>I feel recovered</button>}
          {paused
            ? <button type="button" className="button" disabled={!!busy} onClick={() => void run('resume', () => onChange({ action: 'Resume', expectedVersion: recovery.version }), 'Recovery resumed.')}>Resume recovery</button>
            : <button type="button" className="button button-quiet" disabled={!!busy} onClick={() => void run('pause', () => onChange({ action: 'Pause', expectedVersion: recovery.version }), 'Recovery paused.')}>Pause</button>}
          <button type="button" className="button button-quiet" disabled={!!busy} onClick={() => void run('extend', () => onChange({ action: 'Extend', extendDays: 3, expectedVersion: recovery.version }), 'Three more gentle days added.')}>Add 3 more days</button>
          {!confirmEnd && <button type="button" className="button button-quiet" onClick={() => setConfirmEnd(true)}>End recovery</button>}
        </div>
      )}
      {!compact && <RecoveryAdjust recovery={recovery} busy={!!busy} onChange={(change, words) => run('adjust', () => onChange(change), words)} />}
      {confirmEnd && (
        <div className="journey-confirm" role="group" aria-label="End recovery">
          <p>End your recovery plan now? Your check-ins stay in your history.</p>
          <button type="button" className="button" disabled={!!busy} onClick={() => void run('end', async () => { await onChange({ action: 'End', expectedVersion: recovery.version }); setConfirmEnd(false) })}>End recovery</button>
          <button type="button" className="button button-quiet" onClick={() => setConfirmEnd(false)}>Keep going</button>
        </div>
      )}
      <p className="field-help" role="status" aria-live="polite">{message}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  )
}

function RecoveryAdjust({ recovery, busy, onChange }: { recovery: RecoveryPlan; busy: boolean; onChange: (change: ChangeRecovery, words: string) => void }) {
  const id = useId()
  const [preference, setPreference] = useState(recovery.preference)
  const [effort, setEffort] = useState(recovery.effort)
  return (
    <details className="disclosure recovery-adjust">
      <summary>Adjust recovery</summary>
      <div className="recovery-adjust-body">
        <label className="field" htmlFor={`${id}-pref`}><span className="field-label">On easier days</span>
          <select id={`${id}-pref`} className="input" value={preference} onChange={e => setPreference(e.target.value as RecoveryPreference)}>
            {PREFERENCES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
        <label className="field" htmlFor={`${id}-effort`}><span className="field-label">How hard the race was</span>
          <select id={`${id}-effort`} className="input" value={effort} onChange={e => setEffort(e.target.value as RecoveryEffort)}>
            {EFFORTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
        <button type="button" className="button" disabled={busy} onClick={() => onChange({ action: 'Update', preference, effort, expectedVersion: recovery.version }, 'Recovery updated.')}>Save changes</button>
      </div>
    </details>
  )
}

/** The recovery week: only the recovery plan's own days are marked. Days outside it stay blank, never "rest". */
export function RecoveryWeek({ recovery, today }: { recovery: RecoveryPlan; today: string }) {
  const days = new Map(recovery.days.filter(d => d.date <= recovery.endsOn).map(d => [d.date, d]))
  return (
    <div className="recovery-week">
      <p className="field-label">Recovery week</p>
      <ol aria-label="This recovery week">
        {weekOf(today).map((date, i) => {
          const day = days.get(date)
          const weekday = SHORT_DAY[WEEK[i]!]
          return (
            <li key={date} className={`recovery-week-day is-${day ? day.kind : 'outside'}${date === today ? ' is-today' : ''}`}
              aria-label={`${formatDate(date, 'weekday')} ${formatDate(date, 'dayMonth')}: ${day ? `${day.title}${day.optional ? ', optional' : ''}${day.gated ? ', only if you feel ready' : ''}` : 'not part of your recovery'}`}
              aria-current={date === today ? 'date' : undefined}>
              <span className="recovery-week-name" aria-hidden="true">{weekday}</span>
              <span className="recovery-week-kind" aria-hidden="true">{day ? KIND_WORDS[day.kind] : '—'}{day?.gated ? '?' : ''}</span>
            </li>
          )
        })}
      </ol>
      <p className="field-help">Rest isn’t a missed workout. Days marked ? are only for when you feel ready.</p>
    </div>
  )
}
