import { useId, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../lib/api-client'
import { formatDistance, parseTimeSpan, toKilometres, toTimeSpan, type Units } from '../../lib/format'
import type { ActivitySummary, BodyArea, CheckInStatus, PainLevel, Session, SessionType } from '../../lib/types'
import { DurationInput } from '../builder/controls'
import { durationSeconds, toDuration, type Duration } from '../builder/duration'
import { BODY_AREAS, checkInSummary, EFFORT_WORDS, EXPECTED_EFFORT, PAIN, STATUSES } from './check-in-copy'
import { RunResult } from './RunResult'
import { RUN_TYPES } from './run-types'
import type { SessionCoach } from './useCheckIns'

interface Props {
  session: Session
  coach: SessionCoach
  onDone?: (done: boolean) => void
  runs?: readonly ActivitySummary[]
  done?: boolean
  completion?: boolean
  initialOpen?: boolean
  additional?: boolean
  initialActivityId?: string
  onClose?: () => void
}
const EMPTY_DURATION: Duration = { h: '', m: '', s: '' }
const distanceIn = (km: number | null | undefined, units: Units) =>
  km == null ? '' : String(Math.round((units === 'mi' ? km / 1.609344 : km) * 100) / 100)
function messageOf(error: unknown): string {
  if (error instanceof ApiError) return Object.values(error.fieldErrors).flat()[0] ?? error.message
  return error instanceof Error ? error.message : 'That didn’t save. Try again.'
}

/** A quick completion log, with optional effort/pain details for coaching. */
export function CheckInCard({
  session,
  coach,
  onDone,
  runs = [],
  done = false,
  completion = false,
  initialOpen = false,
  additional = false,
  onClose,
  initialActivityId,
}: Props) {
  const id = useId()
  const existing = coach.get(session)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [open, setOpen] = useState(initialOpen)
  const [status, setStatus] = useState<CheckInStatus>(existing?.status ?? 'Done')
  const [actualType, setActualType] = useState<SessionType | ''>(existing?.actualSessionType ?? '')
  const [activityId, setActivityId] = useState(existing?.distanceKm != null || existing?.duration ? '' : existing?.activityId ?? initialActivityId ?? '')
  const [effort, setEffort] = useState<number | null>(existing?.effort ?? null)
  const [pain, setPain] = useState<PainLevel>(existing?.pain ?? 'None')
  const [painArea, setPainArea] = useState<BodyArea | ''>(existing?.painArea ?? '')
  const [distance, setDistance] = useState(distanceIn(existing?.distanceKm, coach.units))
  const [time, setTime] = useState<Duration>(() =>
    existing?.duration ? toDuration(parseTimeSpan(existing.duration) ?? 0) : EMPTY_DURATION,
  )
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLSelectElement>(null)
  if (session.date > coach.today) return null

  const skipped = status === 'Skipped'
  const expected = EXPECTED_EFFORT[actualType || (status === 'SwappedForEasy' ? 'Easy' : session.type)]
  const distanceKm =
    distance.trim() === ''
      ? null
      : distance === distanceIn(existing?.distanceKm, coach.units) && existing?.distanceKm != null
        ? existing.distanceKm
        : toKilometres(Number(distance), coach.units)
  const seconds = durationSeconds(time)
  const originalActivityId = existing?.activityId ?? initialActivityId
  const association = activityId || ((distanceKm != null || seconds > 0) && runs.some(r => r.id === originalActivityId) ? originalActivityId : null)
  const distanceInvalid = !activityId && distanceKm !== null && !(Number.isFinite(distanceKm) && distanceKm > 0 && distanceKm <= 300)
  const timeInvalid =
    (!activityId && Object.values(time).some((v) => v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0))) ||
    (!activityId && (seconds > 30 * 3600 || (Object.values(time).some((v) => v !== '') && seconds <= 0)))
  const ready =
    !distanceInvalid &&
    !timeInvalid &&
    ((status !== 'CutShort' && status !== 'SwappedForEasy') || effort !== null) &&
    (!additional || !!activityId || distanceKm !== null || seconds > 0)
  const candidates = runs.filter(
    (r) => r.localDate === session.date && !coach.entries?.some((c) => c.activityId === r.id && c.id !== existing?.id),
  )
  const start = (different = false, detailed = true) => {
    setDetailsOpen(detailed)
    setStatus(existing?.status ?? 'Done')
    setActualType(different ? 'Easy' : (existing?.actualSessionType ?? ''))
    setActivityId(existing?.distanceKm != null || existing?.duration ? '' : existing?.activityId ?? '')
    setEffort(existing?.effort ?? null)
    setPain(existing?.pain ?? 'None')
    setPainArea(existing?.painArea ?? '')
    setDistance(distanceIn(existing?.distanceKm, coach.units))
    setTime(existing?.duration ? toDuration(parseTimeSpan(existing.duration) ?? 0) : EMPTY_DURATION)
    setNote(existing?.note ?? '')
    setError(null)
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }
  const close = () => {
    setOpen(false)
    onClose?.()
  }
  const run = async (action: () => Promise<void>, completed: boolean) => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone?.(completed)
      close()
    } catch (failure) {
      setError(messageOf(failure))
    } finally {
      saving.current = false
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
          distanceKm: skipped || activityId || distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
          duration: skipped || activityId || seconds === 0 ? null : toTimeSpan(seconds),
          note: note.trim() || null,
          actualSessionType: skipped ? null : actualType || (status === 'SwappedForEasy' ? 'Easy' : null),
          distanceUnreported: !skipped && (!!activityId || (distanceKm === null && seconds > 0) || (distanceKm === null && !!actualType)),
          activityId: skipped ? null : association || null,
          ...(!skipped && !activityId && association ? { independentMetrics: true } : {}),
        }),
      !skipped,
    )
  }
  const completeWithoutDetails = () =>
    void run(() => coach.save(session, { status: 'Done', effort: null, distanceUnreported: false }), true)

  return (
    <div className="check-in-log">
      {completion && !open && (
        <label className="session-done">
          <input
            type="checkbox"
            checked={existing ? existing.status !== 'Skipped' : done}
            disabled={busy}
            onChange={(e) => {
              if (e.target.checked) start(false, false)
              else if (existing) void run(() => coach.remove(session), false)
              else onDone?.(false)
            }}
          />{' '}
          Complete
        </label>
      )}
      {!open ? (
        <div className="check-in">
          {existing ? (
            <>
              <RunResult entry={existing} runs={runs} units={coach.units} />
              <p className="check-in-summary">
                <span>{checkInSummary(existing)}</span>
                <button type="button" className="link-button" onClick={() => start()} aria-label={`Change how ${session.title} went`}>
                  Change
                </button>
              </p>
            </>
          ) : (
            <div className="submit-row">
              <button type="button" className="button button-quiet check-in-open" onClick={() => start()}>
                How did it go?
              </button>
              <button type="button" className="link-button" onClick={() => start(true)}>
                I ran something different
              </button>
            </div>
          )}
        </div>
      ) : (
        <form className="check-in check-in-form" onSubmit={submit} aria-label={`How ${session.title} went`}>
          <h3>{additional ? 'Log an additional run' : 'Log your run'}</h3>
          {!additional && (
            <p className="field-help">
              Planned: {session.title} · {formatDistance(session.distanceKm, coach.units)}. Your original workout stays visible.
            </p>
          )}
          <div className="field">
            <label className="field-label" htmlFor={`${id}-source`}>
              Run details
            </label>
            <select
              ref={inputRef}
              autoFocus={initialOpen}
              id={`${id}-source`}
              className="input"
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              disabled={busy}
            >
              <option value="">Enter manually</option>
              {candidates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.source.kind === 'Strava' ? 'Strava' : 'Upload'} · {formatDistance(r.distanceKm, coach.units)} ·{' '}
                  {Math.round(r.movingSeconds / 60)} min
                </option>
              ))}
              {activityId && !candidates.some((r) => r.id === activityId) && (
                <option value={activityId}>Imported activity no longer available — choose another option</option>
              )}
            </select>
          </div>
          {activityId && (
            <p className="field-help">
              This entry links to the imported run without duplicating it. Strava details follow its seven-day cache; enter your own
              distance and time manually to keep a lasting record.
            </p>
          )}
          {!activityId && originalActivityId && <p className="field-help">Enter your own measurements below. The activity association prevents this run being counted twice; imported measurements are not copied.</p>}
          {!skipped && (
            <>
              <div className="field">
                <label className="field-label" htmlFor={`${id}-type`}>
                  What did you run?
                </label>
                <select
                  id={`${id}-type`}
                  className="input"
                  value={actualType}
                  onChange={(e) => setActualType(e.target.value as SessionType | '')}
                >
                  <option value="">{additional ? 'Run type not specified' : 'As planned'}</option>
                  {RUN_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                  {actualType && !RUN_TYPES.some((t) => t.value === actualType) && <option value={actualType}>{actualType}</option>}
                </select>
              </div>
              {!activityId && (
                <>
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
                    <span className="field-help">Optional. Enter what you actually ran. With time alone, kilometres stay unrecorded.</span>
                    {distanceInvalid && (
                      <p className="field-error" role="alert">
                        Enter a distance above zero and at most {coach.units === 'mi' ? '186.41 miles' : '300 km'}.
                      </p>
                    )}
                  </div>
                  <DurationInput legend="Time" value={time} onChange={setTime} />
                  {timeInvalid && (
                    <p className="field-error" role="alert">
                      Enter a time above zero and no more than 30 hours.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          <details className="disclosure" open={detailsOpen} onToggle={(e) => setDetailsOpen(e.currentTarget.open)}>
            <summary>How it felt, pain and other details</summary>
            {!additional && (
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
            )}
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
                        <input
                          type="radio"
                          name={`${id}-effort`}
                          checked={effort === n}
                          onChange={() => setEffort(n)}
                          aria-label={`${n}, ${EFFORT_WORDS[n]}`}
                        />
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
                    <select
                      id={`${id}-where`}
                      className="input"
                      value={painArea}
                      onChange={(e) => setPainArea(e.target.value as BodyArea | '')}
                    >
                      <option value="">Choose…</option>
                      {(Object.keys(BODY_AREAS) as BodyArea[]).map((area) => (
                        <option key={area} value={area}>
                          {BODY_AREAS[area]}
                        </option>
                      ))}
                    </select>
                    {pain === 'ChangedRunning' && (
                      <span className="field-help">
                        Pain that changes how you run is a reason to rest. If it’s still there tomorrow, get it checked.
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="field">
              <label className="field-label" htmlFor={`${id}-note`}>
                Anything else? <span className="field-help">(optional)</span>
              </label>
              <textarea
                id={`${id}-note`}
                className="input"
                rows={2}
                maxLength={280}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </details>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <p className="field-help">
            Logging updates your completed running. To change upcoming training, review “Replan from here” in your plan.
          </p>
          <div className="submit-row">
            <button type="submit" className="button" disabled={busy || !ready}>
              {busy ? 'Saving…' : 'Save check-in'}
            </button>
            {!additional && !existing && (
              <button type="button" className="button button-quiet" onClick={completeWithoutDetails} disabled={busy}>
                Complete without details
              </button>
            )}
            <button type="button" className="button button-quiet" onClick={close} disabled={busy}>
              Cancel
            </button>
            {existing && (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => void run(() => coach.remove(session), false)}
                disabled={busy}
              >
                Remove check-in
              </button>
            )}
          </div>
        </form>
      )}
      {!open && error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
