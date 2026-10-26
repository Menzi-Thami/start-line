import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '../../lib/api-client'
import { parseTimeSpan, toKilometres, toTimeSpan } from '../../lib/format'
import type { BodyArea, CheckInStatus, PainLevel, Session } from '../../lib/types'
import { DurationInput } from '../builder/controls'
import { durationSeconds, toDuration, type Duration } from '../builder/duration'
import { BODY_AREAS, checkInSummary, EFFORT_WORDS, EXPECTED_EFFORT, PAIN, STATUSES } from './check-in-copy'
import type { SessionCoach } from './useCheckIns'

interface Props {
  session: Session
  coach: SessionCoach
  /** After a check-in is saved or taken back: whether the run counts as done. */
  onDone?: (done: boolean) => void
}

const EMPTY_DURATION: Duration = { h: '', m: '', s: '' }

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return Object.values(error.fieldErrors).flat()[0] ?? error.message
  return error instanceof Error ? error.message : 'That didn’t save. Try again.'
}

/**
 * "How did it go?" on a planned run: did they do it, how hard it felt, anything hurt, and for a run no watch recorded,
 * how far and how long. About fifteen seconds, and what the coach adjusts the plan from.
 */
export function CheckInCard({ session, coach, onDone }: Props) {
  const id = useId()
  const existing = coach.get(session)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<CheckInStatus>(existing?.status ?? 'Done')
  const [effort, setEffort] = useState<number | null>(existing?.effort ?? null)
  const [pain, setPain] = useState<PainLevel>(existing?.pain ?? 'None')
  const [painArea, setPainArea] = useState<BodyArea | ''>(existing?.painArea ?? '')
  const [distance, setDistance] = useState(existing?.distanceKm ? String(existing.distanceKm) : '')
  const [time, setTime] = useState<Duration>(() => {
    const seconds = existing?.duration ? parseTimeSpan(existing.duration) : null
    return seconds ? toDuration(seconds) : EMPTY_DURATION
  })
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session.date > coach.today) return null

  const skipped = status === 'Skipped'
  const expected = EXPECTED_EFFORT[session.type]
  const distanceKm = distance.trim() === '' ? null : toKilometres(Number(distance), coach.units)
  const seconds = durationSeconds(time)
  const distanceInvalid = distanceKm !== null && !(Number.isFinite(distanceKm) && distanceKm > 0 && distanceKm <= 300)
  const ready = (skipped || effort !== null) && !distanceInvalid

  const start = () => {
    setStatus(existing?.status ?? 'Done')
    setEffort(existing?.effort ?? null)
    setError(null)
    setOpen(true)
  }

  const run = async (action: () => Promise<void>, done: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone?.(done)
      setOpen(false)
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    void run(
      () =>
        coach.save(session, {
          status,
          effort: skipped ? null : effort,
          pain: skipped ? 'None' : pain,
          painArea: !skipped && pain !== 'None' && painArea ? painArea : null,
          distanceKm: skipped || distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
          duration: skipped || seconds === 0 ? null : toTimeSpan(seconds),
          note: note.trim() || null,
        }),
      !skipped,
    )
  }

  if (!open) {
    return (
      <div className="check-in">
        {existing ? (
          <p className="check-in-summary">
            <span>{checkInSummary(existing)}</span>
            {existing.status === 'Done' && existing.effort === null ? (
              // A tick from a run Strava sent: how it felt is the part the coach can use.
              <button type="button" className="link-button" onClick={start} aria-label={`Add how ${session.title} felt`}>
                Add how it felt
              </button>
            ) : (
              <button type="button" className="link-button" onClick={start} aria-label={`Change how ${session.title} went`}>
                Change
              </button>
            )}
          </p>
        ) : (
          <button type="button" className="button button-quiet check-in-open" onClick={start}>
            How did it go?
          </button>
        )}
      </div>
    )
  }

  return (
    <form className="check-in check-in-form" onSubmit={submit} aria-label={`How ${session.title} went`}>
      <fieldset className="field">
        <legend className="field-label">Did you run it?</legend>
        <div className="pills" role="radiogroup">
          {STATUSES.map((s) => (
            <label className="pill" key={s.value}>
              <input type="radio" name={`${id}-status`} checked={status === s.value} onChange={() => setStatus(s.value)} />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      {!skipped && (
        <>
          <fieldset className="field">
            <legend className="field-label">
              How hard did it feel?{' '}
              {effort !== null && (
                <span className="check-in-effort-word">
                  {effort}/10, {EFFORT_WORDS[effort]?.toLowerCase()}
                </span>
              )}
            </legend>
            <div className="pills effort-scale" role="radiogroup">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <label className="pill" key={n}>
                  <input type="radio" name={`${id}-effort`} checked={effort === n} onChange={() => setEffort(n)} aria-label={`${n}, ${EFFORT_WORDS[n]}`} />
                  {n}
                </label>
              ))}
            </div>
            {expected && <span className="field-help">A run like this usually feels about {expected} out of 10.</span>}
          </fieldset>

          <fieldset className="field">
            <legend className="field-label">Did anything hurt?</legend>
            <div className="pills" role="radiogroup">
              {PAIN.map((p) => (
                <label className="pill" key={p.value}>
                  <input type="radio" name={`${id}-pain`} checked={pain === p.value} onChange={() => setPain(p.value)} />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>

          {pain !== 'None' && (
            <div className="field">
              <label className="field-label" htmlFor={`${id}-where`}>
                Where?
              </label>
              <select id={`${id}-where`} className="input" value={painArea} onChange={(e) => setPainArea(e.target.value as BodyArea | '')}>
                <option value="">Choose…</option>
                {(Object.keys(BODY_AREAS) as BodyArea[]).map((area) => (
                  <option key={area} value={area}>
                    {BODY_AREAS[area]}
                  </option>
                ))}
              </select>
              {pain === 'ChangedRunning' && (
                <span className="field-help">Pain that changes how you run is a reason to rest. If it’s still there tomorrow, get it checked.</span>
              )}
            </div>
          )}

          <details className="disclosure">
            <summary>No watch? Add the distance and time</summary>
            <div className="field">
              <label className="field-label" htmlFor={`${id}-distance`}>
                Distance ({coach.units})
              </label>
              <input
                id={`${id}-distance`}
                className="input check-in-distance"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                aria-invalid={distanceInvalid}
              />
            </div>
            <DurationInput legend="Time" value={time} onChange={setTime} />
          </details>
        </>
      )}

      <div className="field">
        <label className="field-label" htmlFor={`${id}-note`}>
          Anything else? <span className="field-help">(optional)</span>
        </label>
        <textarea id={`${id}-note`} className="input" rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="submit-row">
        <button type="submit" className="button" disabled={busy || !ready}>
          {busy ? 'Saving…' : 'Save check-in'}
        </button>
        <button type="button" className="button button-quiet" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        {existing && (
          <button type="button" className="button button-quiet" onClick={() => void run(() => coach.remove(session), false)} disabled={busy}>
            Remove check-in
          </button>
        )}
      </div>
    </form>
  )
}
