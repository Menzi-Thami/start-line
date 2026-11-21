import './ai-coach.css'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { addDays, formatDate, formatDistance, formatPaceRange, type Units } from '../../lib/format'
import type {
  AdjustedSession,
  AdjustmentKind,
  AiCoachStatus,
  CoachAnswer,
  SessionAdjustment,
  SessionAdjustmentRequest,
  TrainingPlan,
} from '../../lib/types'
import { ApiError } from '../../lib/api-client'
import { Runner } from '../shared/Runner'
import { aboutTime, evidenceLine, exactDistance, toAdjustmentRequest } from './ai-coach-model'

/** Everything the coach can do, bound to the runner's own plan by the app. */
export interface AiCoachActions {
  status: () => Promise<AiCoachStatus>
  setConsent: (consent: boolean) => Promise<AiCoachStatus>
  ask: (question: string) => Promise<CoachAnswer>
  preview: (request: SessionAdjustmentRequest) => Promise<SessionAdjustment>
  /** Applies exactly the previewed change; the app refreshes the plan on screen. */
  apply: (request: SessionAdjustmentRequest, token: string) => Promise<SessionAdjustment>
  /** Puts days back as the plan first wrote them: the undo. */
  restore: (dates: string[]) => Promise<void>
}

interface Props {
  plan: TrainingPlan
  today: string
  units: Units
  actions: AiCoachActions
  /** Opens the weekly review elsewhere on the plan, rather than repeating it here. */
  onOpenWeeklyReview?: () => void
}

const HORIZON_DAYS = 14
const EXAMPLES = ['I only have 30 minutes today', 'Make my long run shorter', 'How should next week change?'] as const
const KINDS: readonly { value: AdjustmentKind; label: string }[] = [
  { value: 'Duration', label: 'Time' },
  { value: 'Distance', label: 'Distance' },
  { value: 'Pace', label: 'Pace' },
]
const OUTCOME: Record<SessionAdjustment['outcome'], string> = {
  Proposed: 'Suggested change',
  NoChangeNeeded: 'No change needed',
  NotRecommended: 'Not recommended',
}

function SessionSide({ label, session, rest, units }: { label: string; session: AdjustedSession | null; rest?: boolean; units: Units }) {
  return (
    <div className="ai-coach-side">
      <p className="ai-coach-side-label">{label}</p>
      {rest || !session ? (
        <p className="ai-coach-side-title">Rest day</p>
      ) : (
        <>
          <p className="ai-coach-side-title">{session.title}</p>
          <ul className="ai-coach-side-facts">
            <li>{formatDate(session.date)}</li>
            <li>{exactDistance(session.distanceKm, units)}</li>
            <li>{aboutTime(session.estimatedMinutes)}</li>
            {session.fastestSecondsPerKm != null && session.slowestSecondsPerKm != null && (
              <li>{formatPaceRange(session.fastestSecondsPerKm, session.slowestSecondsPerKm, units)}</li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}

/**
 * The coach, behind one quiet button. Ask in words or change one run exactly; either way Taperday's training rules check the
 * change and show it before and after. Nothing loads until the runner opens it, nothing is asked until they ask, and nothing
 * changes until they apply it, with an undo straight after.
 */
export function AiCoachPanel({ plan, today, units, actions, onOpenWeeklyReview }: Props) {
  const ids = { panel: useId(), question: useId(), run: useId(), value: useId(), valueError: useId(), consent: useId() }
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<AiCoachStatus | null>(null)
  const statusRequested = useRef(false)
  const [mode, setMode] = useState<'ask' | 'change'>('ask')
  const [question, setQuestion] = useState('')

  const upcoming = plan.weeks
    .flatMap(week => week.sessions)
    .filter(session => session.type !== 'Strength' && session.type !== 'Race' && session.date >= today && session.date < addDays(today, HORIZON_DAYS))
  const [date, setDate] = useState(() => upcoming[0]?.date ?? '')
  const [kind, setKind] = useState<AdjustmentKind>('Duration')
  const [value, setValue] = useState('')
  const [valueError, setValueError] = useState<string | null>(null)

  const [answer, setAnswer] = useState<CoachAnswer | null>(null)
  const [adjustment, setAdjustment] = useState<SessionAdjustment | null>(null)
  const [applied, setApplied] = useState<SessionAdjustmentRequest | null>(null)
  const [stale, setStale] = useState<SessionAdjustmentRequest | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const working = useRef(false)
  const resultRef = useRef<HTMLDivElement>(null)
  const [resultSeq, setResultSeq] = useState(0)

  // Each new result takes focus, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (resultSeq > 0) resultRef.current?.focus()
  }, [resultSeq])

  useEffect(() => {
    if (!open || statusRequested.current) return
    statusRequested.current = true
    // Without a status the coach still works from the training rules; it just doesn't offer the AI part.
    actions.status().then(setStatus, () => undefined)
  }, [open, actions])

  const showResult = () => setResultSeq(n => n + 1)

  const run = async (work: () => Promise<void>) => {
    if (working.current) return
    working.current = true
    setBusy(true)
    try {
      await work()
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : 'That didn’t work. Try again.', error: true })
      showResult()
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  const clear = () => {
    setAnswer(null)
    setAdjustment(null)
    setApplied(null)
    setStale(null)
    setMessage(null)
  }

  const ask = (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length < 3) return
    void run(async () => {
      clear()
      const reply = await actions.ask(trimmed)
      setAnswer(reply)
      setAdjustment(reply.adjustment)
      if (reply.source === 'Ai') setStatus(current => current && { ...current, aiQuestionsLeftToday: Math.max(0, current.aiQuestionsLeftToday - 1) })
      showResult()
    })
  }

  const preview = (request: SessionAdjustmentRequest) =>
    void run(async () => {
      clear()
      setAdjustment(await actions.preview(request))
      showResult()
    })

  const check = (event: FormEvent) => {
    event.preventDefault()
    if (!date) return
    const request = toAdjustmentRequest(date, kind, value, units)
    if ('error' in request) {
      setValueError(request.error)
      return
    }
    setValueError(null)
    preview(request)
  }

  const apply = () => {
    if (!adjustment?.token) return
    const { request, token } = adjustment
    void run(async () => {
      try {
        await actions.apply(request, token)
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 409)) throw cause
        // The plan, the runner's running or the day changed since the preview: check again rather than apply something stale.
        setAdjustment(null)
        setStale(request)
        setMessage({ text: 'Your plan changed since this preview. Check it again.', error: true })
        showResult()
        return
      }
      setAdjustment(null)
      setApplied(request)
      setMessage({ text: 'Done. Your plan is updated.' })
      showResult()
    })
  }

  const undo = () => {
    if (!applied) return
    const day = applied.date
    void run(async () => {
      await actions.restore([day])
      setApplied(null)
      setMessage({ text: 'Undone. That run is back as your plan first wrote it.' })
      showResult()
    })
  }

  const keep = () => {
    clear()
    setMessage({ text: 'Your plan stays as it is.' })
  }

  const setConsent = (consent: boolean) =>
    void run(async () => {
      setStatus(await actions.setConsent(consent))
    })

  const offerReview = !!answer && (answer.intent === 'WeeklyReview' || answer.offerWeeklyReview) && !!onOpenWeeklyReview
  const valueLabel = kind === 'Duration' ? 'Minutes you have' : kind === 'Distance' ? `Distance in ${units === 'mi' ? 'miles' : 'km'}` : `Pace per ${units === 'mi' ? 'mile' : 'km'} (m:ss)`
  const safeLimit = adjustment?.safeLimitKm != null && adjustment.request.km !== adjustment.safeLimitKm ? adjustment.safeLimitKm : null
  const off = status?.enabled === false

  return (
    <section className="ai-coach" aria-label="Coach">
      <button type="button" className="button button-quiet ai-coach-toggle" aria-expanded={open} aria-controls={ids.panel} onClick={() => setOpen(value => !value)}>
        <Runner pose={applied ? 'victory' : 'crouch'} size={18} />
        {open ? 'Hide the coach' : 'Ask the coach'}
      </button>
      <div id={ids.panel} className="ai-coach-body" hidden={!open}>
        {open && (
          <>
            <p className="field-help">Ask about a run, or change one. You’ll see what changes before anything is saved.</p>

            {off ? (
              <p className="field-help">The coach isn’t available just now. “Change my plan” still works.</p>
            ) : (
              <>
                <fieldset className="ai-coach-group">
                  <legend className="visually-hidden">How can the coach help?</legend>
                  <div className="pills">
                    <label className="pill"><input type="radio" name={`${ids.panel}-mode`} checked={mode === 'ask'} onChange={() => setMode('ask')} />Ask</label>
                    <label className="pill"><input type="radio" name={`${ids.panel}-mode`} checked={mode === 'change'} onChange={() => setMode('change')} />Change a run</label>
                  </div>
                </fieldset>

                {mode === 'ask' ? (
                  <form className="ai-coach-form" onSubmit={event => { event.preventDefault(); ask(question) }}>
                    <div className="field">
                      <label className="field-label" htmlFor={ids.question}>Your question</label>
                      <textarea
                        id={ids.question}
                        className="input"
                        value={question}
                        onChange={event => setQuestion(event.target.value.slice(0, 500))}
                        rows={2}
                        maxLength={500}
                        placeholder="I only have 30 minutes today"
                      />
                    </div>
                    <div className="ai-coach-examples" role="group" aria-label="Examples">
                      {EXAMPLES.map(example => (
                        <button key={example} type="button" className="chip-button" disabled={busy} onClick={() => { setQuestion(example); ask(example) }}>
                          {example}
                        </button>
                      ))}
                    </div>
                    <button type="submit" className="button button-primary" disabled={busy || question.trim().length < 3}>
                      {busy ? 'Thinking…' : 'Ask'}
                    </button>
                  </form>
                ) : upcoming.length === 0 ? (
                  <p className="field-help">No runs in the next two weeks to change.</p>
                ) : (
                  <form className="ai-coach-form" onSubmit={check} noValidate>
                    <div className="field">
                      <label className="field-label" htmlFor={ids.run}>Which run?</label>
                      <select id={ids.run} className="input" value={date} onChange={event => setDate(event.target.value)}>
                        {upcoming.map(session => (
                          <option key={session.date} value={session.date}>
                            {`${formatDate(session.date)} · ${session.title} ${formatDistance(session.distanceKm, units)}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <fieldset className="field ai-coach-group">
                      <legend className="field-label">What do you want to change?</legend>
                      <div className="pills">
                        {KINDS.map(option => (
                          <label key={option.value} className="pill">
                            <input type="radio" name={`${ids.panel}-kind`} value={option.value} checked={kind === option.value} onChange={() => { setKind(option.value); setValue(''); setValueError(null) }} />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="field">
                      <label className="field-label" htmlFor={ids.value}>{valueLabel}</label>
                      <input
                        id={ids.value}
                        className="input ai-coach-value"
                        type="text"
                        inputMode={kind === 'Pace' ? 'text' : kind === 'Duration' ? 'numeric' : 'decimal'}
                        autoComplete="off"
                        value={value}
                        placeholder={kind === 'Duration' ? '30' : kind === 'Distance' ? '5' : '6:30'}
                        aria-invalid={valueError ? true : undefined}
                        aria-describedby={valueError ? ids.valueError : undefined}
                        onChange={event => { setValue(event.target.value); setValueError(null) }}
                      />
                      {valueError && <p id={ids.valueError} className="field-error">{valueError}</p>}
                    </div>
                    <button type="submit" className="button button-primary" disabled={busy || !value.trim()}>
                      {busy ? 'Checking…' : 'Check this change'}
                    </button>
                  </form>
                )}

                {status?.modelAvailable && (
                  <div className="ai-coach-consent">
                    <label className="session-done" htmlFor={ids.consent}>
                      <input id={ids.consent} type="checkbox" checked={status.consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />
                      {' '}Use AI to understand my questions
                    </label>
                    <p className="field-help">
                      {status.consent
                        ? `AI questions left today: ${status.aiQuestionsLeftToday}`
                        : 'Your question, your plan and the runs you logged or uploaded are sent to our AI provider. Strava data never is. You can turn this off any time.'}
                    </p>
                  </div>
                )}
              </>
            )}

            <div ref={resultRef} className="ai-coach-result" tabIndex={-1} aria-live="polite">
              {answer && (
                <div className="ai-coach-answer">
                  {/* A checked change carries its own reason in the card: don't say it twice. */}
                  {answer.reply !== answer.adjustment?.reason && <p className="ai-coach-reply">{answer.reply}</p>}
                  {answer.notice && <p className="field-help">{answer.notice}</p>}
                  {offerReview && <button type="button" className="button" onClick={onOpenWeeklyReview}>Review next week</button>}
                </div>
              )}

              {adjustment && (
                <article className="ai-coach-compare" data-outcome={adjustment.outcome} aria-label={OUTCOME[adjustment.outcome]}>
                  <p className="ai-coach-outcome">{OUTCOME[adjustment.outcome]}</p>
                  <p>{adjustment.reason}</p>
                  {adjustment.outcome === 'Proposed' && (
                    <>
                      <div className="ai-coach-sides">
                        <SessionSide label="Before" session={adjustment.before} units={units} />
                        <span className="ai-coach-arrow" aria-hidden="true">→</span>
                        <SessionSide label="After" session={adjustment.after} rest={adjustment.becomesRest} units={units} />
                      </div>
                      <p className="ai-coach-week">
                        Week total: {exactDistance(adjustment.weekKmBefore, units)} → {exactDistance(adjustment.weekKmAfter, units)}
                      </p>
                    </>
                  )}
                  <div className="ai-coach-actions">
                    {adjustment.outcome === 'Proposed' && adjustment.token && (
                      <button type="button" className="button button-primary" disabled={busy} onClick={apply}>
                        {busy ? 'Applying…' : 'Apply this change'}
                      </button>
                    )}
                    {safeLimit !== null && (
                      <button type="button" className="button" disabled={busy} onClick={() => preview({ date: adjustment.request.date, kind: 'Distance', km: safeLimit })}>
                        Try {exactDistance(safeLimit, units)} instead
                      </button>
                    )}
                    <button type="button" className="button button-quiet" disabled={busy} onClick={keep}>Keep my plan</button>
                  </div>
                </article>
              )}

              {message && (
                <p className={`ai-coach-message${message.error ? ' field-error' : ''}`} role={message.error ? 'alert' : 'status'}>
                  {message.text}
                  {applied && !message.error && <>{' '}<button type="button" className="link-button" disabled={busy} onClick={undo}>Undo</button></>}
                  {stale && message.error && <>{' '}<button type="button" className="link-button" disabled={busy} onClick={() => preview(stale)}>Check again</button></>}
                </p>
              )}

              {(answer || adjustment) && (
                <div className="ai-coach-source">
                  {answer && <p>{evidenceLine(answer.evidence)}</p>}
                  <p>{answer?.source === 'Ai' ? 'Understood with AI · every change is checked by Taperday’s rules.' : answer ? 'Answered by Taperday’s training rules.' : 'Checked by Taperday’s training rules.'}</p>
                  <p>Guidance, not medical advice. Nothing changes until you apply it.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
