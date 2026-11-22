import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../lib/api-client'
import type { BodyArea, CheckIn, CheckInRequest, CheckInStatus, PainLevel, Session } from '../../lib/types'
import { BODY_AREAS, EFFORT_WORDS, EXPECTED_EFFORT, PAIN, ratingSummary, STATUSES } from './check-in-copy'
import { AdaptationPrompt } from './AdaptationPrompt'
import type { SessionCoach } from './useCheckIns'

interface Props {
  session: Session
  coach: SessionCoach
  /** Opens the full run log (own distance, time, run type, linked recording) for this session. */
  onFullForm?: () => void
  /** "Not now": the runner doesn't want to rate this one. Nothing is saved. */
  onDismiss?: () => void
  /** Offer "Tick without rating": a plain Done with no effort. Off where another control already does that. */
  quickTick?: boolean
  /** After the runner's own answer is saved (or queued on this device): whether they ran. */
  onSaved?: (ran: boolean) => void
}

const SCALE = Array.from({ length: 10 }, (_, i) => i + 1)
const DIFFERENT: readonly CheckInStatus[] = ['CutShort', 'SwappedForEasy', 'Skipped']
const SAVE_LABEL: Record<CheckInStatus, string> = { Done: 'Save as planned', CutShort: 'Save as cut short', SwappedForEasy: 'Save as easy instead', Skipped: 'Save as skipped' }

/** Current runner-local week: an unsaved recovery proposal can be found again by revisiting a rated run. */
const weekStart = (today: string) => {
  const day = new Date(`${today}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.toISOString().slice(0, 10)
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return Object.values(error.fieldErrors).flat()[0] ?? error.message
  return error instanceof Error ? error.message : 'That didn’t save. Try again.'
}

/** Whether a saved answer carries more than this control edits: the runner's own figures, a run type or a linked recording. */
const hasDetails = (entry: CheckIn) =>
  entry.distanceKm != null || !!entry.duration || !!entry.activityId || (entry.actualSessionType != null && !(entry.status === 'SwappedForEasy' && entry.actualSessionType === 'Easy'))

/**
 * The two-tap rating after a run: pick how hard it felt (1–10), then Save as planned. Optional: a run Strava completed stays
 * completed whether or not it's rated. Only the runner's own answers are saved, in their existing check-in (status, effort,
 * pain, note); never Strava's distance, time, pace, heart rate or activity id (docs/strava-sync.md). Anything else goes
 * through the full run log.
 */
export function PostRunRating({ session, coach, onFullForm, onDismiss, quickTick = false, onSaved }: Props) {
  const id = useId()
  const existing = coach.get(session)
  const [editing, setEditing] = useState(!existing)
  const [effort, setEffort] = useState<number | null>(existing?.effort ?? null)
  const [status, setStatus] = useState<CheckInStatus>(existing?.status ?? 'Done')
  const [different, setDifferent] = useState(!!existing && existing.status !== 'Done')
  const [pain, setPain] = useState<PainLevel>(existing?.pain ?? 'None')
  const [painArea, setPainArea] = useState<BodyArea | ''>(existing?.painArea ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const saving = useRef(false)
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const legendRef = useRef<HTMLLegendElement>(null)
  const [focusTarget, setFocusTarget] = useState<'summary' | 'scale' | null>(null)
  // Each save asks the coach once what it makes of the answer (silent unless the rules suggest a change).
  const [checks, setChecks] = useState(0)

  // After saving, the runner lands on their answer; after "Edit feedback", on the scale. Never on anything far away.
  useEffect(() => {
    if (focusTarget === 'summary') summaryRef.current?.focus({ preventScroll: true })
    if (focusTarget === 'scale') legendRef.current?.parentElement?.querySelector<HTMLInputElement>('input:checked, input')?.focus({ preventScroll: true })
  }, [focusTarget, editing])

  // A run logged elsewhere on this day (Recorded's "Log this run") saves the check-in while this editor is open.
  // Show that saved answer instead of leaving an untouched editor behind with a Cancel button. A runner who has
  // already picked a score keeps their editor; our own save handles its own switch.
  const hadExisting = useRef(!!existing)
  useEffect(() => {
    if (existing && !hadExisting.current && !saving.current && effort === null) setEditing(false)
    hadExisting.current = !!existing
  }, [existing, effort])

  if (session.date > coach.today || session.type === 'Race' || session.type === 'Strength') return null

  const skipped = status === 'Skipped'
  const expected = EXPECTED_EFFORT[status === 'SwappedForEasy' ? 'Easy' : session.type]
  const ready = skipped || effort !== null
  const pending = coach.pendingFor?.(session) ?? false
  // An in-week self-report is durable; meaningful advice must not vanish on refresh or navigation.
  // Don't ask the server while the independently authored response is still queued offline.
  const reviewable = !pending && (checks > 0 || (!!existing && existing.date >= weekStart(coach.today)
    && existing.date <= coach.today && (existing.effort != null || existing.pain !== 'None' || existing.status !== 'Done')))

  const save = async (answers: CheckInRequest) => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      await coach.save(session, answers)
      setEditing(false)
      setDetailsOpen(false)
      setFocusTarget('summary')
      setChecks(n => n + 1)
      onSaved?.(answers.status !== 'Skipped')
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
    void save({
      status,
      effort: skipped ? null : effort,
      pain: skipped ? 'None' : pain,
      painArea: !skipped && pain !== 'None' && painArea ? painArea : null,
      // Only what the runner chose here. Never a measured distance or time, and never a link to an imported recording.
      distanceKm: null,
      duration: null,
      activityId: null,
      note: note.trim() || null,
      actualSessionType: status === 'SwappedForEasy' ? 'Easy' : null,
      distanceUnreported: status === 'SwappedForEasy',
    })
  }

  const edit = () => {
    if (existing && hasDetails(existing) && onFullForm) { onFullForm(); return }
    setEffort(existing?.effort ?? null)
    setStatus(existing?.status ?? 'Done')
    setDifferent(!!existing && existing.status !== 'Done')
    setPain(existing?.pain ?? 'None')
    setPainArea(existing?.painArea ?? '')
    setNote(existing?.note ?? '')
    setError(null)
    setEditing(true)
    setFocusTarget('scale')
  }

  if (existing && !editing) {
    return (
      <div className="post-run-rating is-saved">
        <p className="post-run-rating-summary" ref={summaryRef} tabIndex={-1}>
          <strong>{ratingSummary(existing)}</strong>
          <span className="field-help" role="status">{pending ? 'Saved on this device, syncing' : 'Saved'}</span>
        </p>
        <button type="button" className="link-button" onClick={edit} aria-label={`Edit feedback for ${session.title}`}>Edit</button>
        {reviewable && <AdaptationPrompt key={`${existing.updatedAt ?? ''}|${checks}`} entry={existing} coach={coach} />}
      </div>
    )
  }

  return (
    <form className="post-run-rating" onSubmit={submit} aria-label={`Rate ${session.title}`}>
      {!skipped && (
        <fieldset className="post-run-rating-scale">
          <legend ref={legendRef} className="post-run-rating-title">How hard did it feel?</legend>
          <div className="rating-scale" role="radiogroup" aria-describedby={`${id}-expected`}>
            {SCALE.map(n => (
              <label className="pill" key={n} title={EFFORT_WORDS[n]}>
                <input type="radio" name={`${id}-effort`} checked={effort === n} onChange={() => setEffort(n)} disabled={busy} aria-label={`${n}, ${EFFORT_WORDS[n]}`} />
                {n}
              </label>
            ))}
          </div>
          <p className="field-help" id={`${id}-expected`}>
            {effort !== null ? <span className="post-run-rating-word" aria-live="polite">{effort}/10, {EFFORT_WORDS[effort]?.toLowerCase()}. </span> : null}
            {expected ? `Expected for ${status === 'SwappedForEasy' ? 'an easy run' : session.title.toLowerCase()}: ${expected}/10.` : null}
          </p>
        </fieldset>
      )}

      {different && (
        <fieldset className="field post-run-rating-status">
          <legend className="field-label">What did you do instead?</legend>
          <div className="pills" role="radiogroup">
            {STATUSES.filter(s => s.value === 'Done' || DIFFERENT.includes(s.value)).map(s => (
              <label className="pill" key={s.value}>
                <input type="radio" name={`${id}-status`} checked={status === s.value} onChange={() => setStatus(s.value)} disabled={busy} />
                {s.value === 'Done' ? 'As planned' : s.value === 'SwappedForEasy' ? 'Easy instead' : s.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="post-run-rating-actions">
        {/* Not the screen's primary button: on Home and the day view that stays Open run details / View run analysis. */}
        <button type="submit" className="button" disabled={busy || !ready}>{busy ? 'Saving…' : SAVE_LABEL[status]}</button>
        {!different && <button type="button" className="link-button" onClick={() => setDifferent(true)} disabled={busy}>Did something different?</button>}
        {existing && <button type="button" className="link-button" onClick={() => { setEditing(false); setFocusTarget('summary') }} disabled={busy}>Cancel</button>}
        {!existing && onDismiss && <button type="button" className="link-button" onClick={onDismiss} disabled={busy}>Not now</button>}
      </div>

      <details className="disclosure post-run-rating-more" open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
        <summary>More details</summary>
        {!skipped && (
          <>
            <fieldset className="field">
              <legend className="field-label">Did anything hurt?</legend>
              <div className="pills" role="radiogroup">
                {PAIN.map(p => (
                  <label className="pill" key={p.value}>
                    <input type="radio" name={`${id}-pain`} checked={pain === p.value} onChange={() => setPain(p.value)} disabled={busy} />
                    {p.label}
                  </label>
                ))}
              </div>
            </fieldset>
            {pain !== 'None' && (
              <div className="field">
                <label className="field-label" htmlFor={`${id}-where`}>Where?</label>
                <select id={`${id}-where`} className="input" value={painArea} onChange={event => setPainArea(event.target.value as BodyArea | '')} disabled={busy}>
                  <option value="">Choose…</option>
                  {(Object.keys(BODY_AREAS) as BodyArea[]).map(area => <option key={area} value={area}>{BODY_AREAS[area]}</option>)}
                </select>
                {pain === 'ChangedRunning' && <span className="field-help">Pain that changes how you run is a reason to rest. If it’s still there tomorrow, get it checked.</span>}
              </div>
            )}
          </>
        )}
        <div className="field">
          <label className="field-label" htmlFor={`${id}-note`}>Anything else? <span className="field-help">(optional)</span></label>
          <textarea id={`${id}-note`} className="input" rows={2} maxLength={280} value={note} onChange={event => setNote(event.target.value)} disabled={busy} />
        </div>
        <div className="post-run-rating-actions">
          {onFullForm && <button type="button" className="link-button" onClick={onFullForm} disabled={busy}>Add your own distance and time</button>}
          {quickTick && !existing && (
            <button type="button" className="link-button" disabled={busy} onClick={() => void save({ status: 'Done', effort: null, distanceUnreported: false })}>
              Tick without rating
            </button>
          )}
        </div>
      </details>

      {error && <p className="field-error" role="alert">{error}</p>}
    </form>
  )
}
