import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { addDays, formatDate, formatDistance, formatDuration, formatPace, toKilometres, type Units } from '../../lib/format'
import { LATEST_PLAN_VERSION, type PlanInputs } from '../../lib/plan-url'
import { SHORT_DAY, WEEK, type DayOfWeek, type Experience, type Race } from '../../lib/types'
import { DayChoice, DayPills, DurationInput, FieldError } from './controls'
import { DatePicker } from './DatePicker'
import { durationSeconds, toDuration, type Duration } from './duration'
import { GoalEstimator } from './GoalEstimator'
import { describeRecent, emptyRecent, recentDraft, recentInputs, type RecentDraft } from './recent-result'

export type RacesState = { kind: 'loading' } | { kind: 'ready'; races: Race[] } | { kind: 'error'; message: string }

const OTHER = 'other'

const SHORTCUTS = [
  { label: '5K', km: 5 },
  { label: '10K', km: 10 },
  { label: 'Half', km: 21.0975 },
  { label: 'Marathon', km: 42.195 },
] as const

const EXPERIENCE: { value: Experience; title: string; note: string }[] = [
  { value: 'New', title: 'Fairly new', note: 'Under a year of regular running, or coming back from a break.' },
  { value: 'Regular', title: 'Regular', note: 'You run most weeks and have raced before.' },
  { value: 'Experienced', title: 'Experienced', note: 'Years of steady training and a few of these races behind you.' },
]

export type FieldErrors = Partial<Record<'race' | 'distance' | 'date' | 'goal' | 'runDays' | 'longRunDay' | 'startOn' | 'currentKm' | 'strength', string>>
type Field = keyof FieldErrors

type StartChoice = 'monday' | 'today' | 'day'

/** The Monday a plan starts on when the runner doesn't choose: today if it's a Monday, otherwise the next one. */
const nextMonday = (today: string) => addDays(today, (8 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7)

// One question per screen. Each field lives on exactly one step, so an error (ours or the server's) can send the
// runner straight back to the screen that needs fixing.
const STEPS = [
  { title: 'Which race?', hint: 'Pick it from the list, or tell us about any other race.', fields: ['race', 'distance', 'date'] },
  { title: 'What’s your goal time?', hint: 'Every session’s pace is worked out from this.', fields: ['goal'] },
  { title: 'When can you run?', hint: 'Hard runs never land back to back.', fields: ['runDays', 'longRunDay', 'startOn'] },
  { title: 'About you', hint: 'So your plan starts where you are.', fields: ['currentKm'] },
  { title: 'Check and build', hint: 'Change anything you like, then build your plan.', fields: ['strength'] },
] as const satisfies readonly { title: string; hint: string; fields: readonly Field[] }[]

const LAST_STEP = STEPS.length - 1

function firstStepWith(errors: FieldErrors): number | null {
  const index = STEPS.findIndex((step) => step.fields.some((field) => errors[field]))
  return index === -1 ? null : index
}

interface Props {
  races: RacesState
  onRetryRaces: () => void
  initial: PlanInputs | null
  units: Units
  busy: boolean
  serverErrors: FieldErrors
  today: string
  onSubmit: (inputs: PlanInputs) => void
  /** Shown above the first question only. */
  intro?: ReactNode
  /** Offered while changing the answers of a plan that's already built. */
  onCancel?: () => void
  /** Something to finish before the questions, like signing up. While present, it's the screen shown. */
  gate?: Gate
}

/** A screen in front of the questions that the wizard can't complete itself; it goes away when its job is done. */
export interface Gate {
  /** Changes when the gate's own content does, so each new state slides in. */
  key: string
  title: string
  hint: string
  body: ReactNode
}

interface Draft {
  race: string
  otherKm: string
  otherDate: string
  otherName: string
  goal: Duration
  runDays: DayOfWeek[]
  longRunDay: DayOfWeek | null
  experience: Experience
  currentKm: string
  strengthDays: DayOfWeek[]
  /** When to start: the next Monday (as every plan before), today, or a day the runner picks. */
  start: StartChoice
  startOn: string
  /** A recent race or time trial, optional: it lets the coach say whether the goal is realistic. */
  recent: RecentDraft
}

function draftFrom(initial: PlanInputs | null, units: Units, today: string): Draft {
  if (!initial) {
    return {
      race: '',
      otherKm: '',
      otherDate: '',
      otherName: '',
      goal: { h: '', m: '', s: '' },
      runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'],
      longRunDay: 'Sunday',
      experience: 'Regular',
      currentKm: '',
      strengthDays: [],
      start: 'monday',
      startOn: '',
      recent: emptyRecent(),
    }
  }
  const fromKm = (km: number | undefined) => (km ? String(Math.round((units === 'mi' ? km / 1.609344 : km) * 10) / 10) : '')
  return {
    race: initial.raceSlug ?? OTHER,
    otherKm: fromKm(initial.distanceKm),
    otherDate: initial.raceDate ?? '',
    otherName: initial.raceName ?? '',
    goal: toDuration(initial.goalSeconds),
    runDays: initial.runDays,
    longRunDay: initial.longRunDay,
    experience: initial.experience,
    currentKm: fromKm(initial.currentWeeklyKm),
    strengthDays: initial.strengthDays,
    start: !initial.startOn ? 'monday' : initial.startOn === today ? 'today' : 'day',
    startOn: initial.startOn ?? '',
    recent: recentDraft(initial.recent, today),
  }
}

function validate(draft: Draft, goalSeconds: number, today: string, raceDate: string | null): FieldErrors {
  const found: FieldErrors = {}
  if (!draft.race) found.race = 'Choose a race, or pick "another race" and tell us about it.'
  if (draft.race === OTHER) {
    if (!(Number(draft.otherKm) > 0)) found.distance = 'Enter the race distance.'
    if (!draft.otherDate) found.date = 'Enter the race date.'
  }
  if (goalSeconds <= 0) found.goal = 'Enter a goal time. Not sure? Use the estimate below.'
  if (draft.runDays.length < 3) found.runDays = 'Pick at least three days. Two runs a week isn’t enough to build on.'
  if (!draft.longRunDay) found.longRunDay = 'Pick which of your days is the long run.'
  if (draft.start === 'day') {
    const latest = raceDate ? addDays(raceDate, -14) : null
    if (!draft.startOn) found.startOn = 'Pick the day you want to start.'
    else if (draft.startOn < today) found.startOn = 'Pick today or a day after it.'
    else if (latest && draft.startOn > latest) found.startOn = 'Start at least two weeks before your race, so there’s a plan to follow.'
  }
  return found
}

const onStep = (errors: FieldErrors, step: number): FieldErrors =>
  Object.fromEntries(Object.entries(errors).filter(([field]) => (STEPS[step]!.fields as readonly string[]).includes(field)))

const dayList = (days: DayOfWeek[]) => WEEK.filter((d) => days.includes(d)).map((d) => SHORT_DAY[d]).join(', ')

/** The day the plan will start, for the summary. */
function startSummary(draft: Draft, today: string): string {
  const day = draft.start === 'today' ? today : draft.start === 'day' ? draft.startOn : nextMonday(today)
  return day ? formatDate(day, 'long') : 'Pick a day'
}

/**
 * When to start: the next Monday (as every plan did before), today, or any day up to two weeks before the race. Weeks
 * run Monday to Sunday, so a start mid-week makes a short first week, and the summary says which day it is.
 */
function StartDay({ draft, today, raceDate, onChange, error }: {
  draft: Draft
  today: string
  raceDate: string | null
  onChange: (start: StartChoice, startOn: string) => void
  error?: string
}) {
  const id = useId()
  const monday = nextMonday(today)
  const options: { value: StartChoice; title: string; note: string }[] = [
    { value: 'monday', title: monday === today ? 'Today' : 'Next Monday', note: formatDate(monday) },
    ...(monday === today ? [] : [{ value: 'today' as const, title: 'Today', note: `${formatDate(today)}: a short first week` }]),
    { value: 'day', title: 'Another day', note: 'Up to two weeks before your race' },
  ]

  return (
    <fieldset className="field" style={{ border: 0, padding: 0 }}>
      <legend className="field-label">When do you want to start?</legend>
      <div className="segmented" role="radiogroup" aria-label="When to start">
        {options.map((o) => (
          <label className="segment" key={o.value}>
            <input type="radio" name={`${id}-start`} checked={draft.start === o.value} onChange={() => onChange(o.value, o.value === 'day' ? draft.startOn : '')} />
            <strong>{o.title}</strong>
            <span>{o.note}</span>
          </label>
        ))}
      </div>
      {draft.start === 'day' && (
        <div className="field" style={{ marginTop: 'var(--space-3)' }}>
          <label className="field-label" htmlFor={`${id}-date`}>
            Start on
          </label>
          <DatePicker
            id={`${id}-date`}
            value={draft.startOn}
            onChange={(d) => onChange('day', d)}
            min={today}
            max={raceDate ? addDays(raceDate, -14) : undefined}
            today={today}
            invalid={!!error}
            describedBy={error ? `${id}-error` : undefined}
          />
        </div>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  )
}

export function BuilderForm({ races, onRetryRaces, initial, units, busy, serverErrors, today, onSubmit, intro, onCancel, gate }: Props) {
  const id = useId()
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial, units, today))
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  // Changing an existing plan opens on the summary: every answer is already there.
  const [step, setStep] = useState(() => firstStepWith(serverErrors) ?? (initial ? LAST_STEP : 0))
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null)
  const [seenServerErrors, setSeenServerErrors] = useState(serverErrors)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  // The server turned the plan down: go back to the first screen it complained about.
  if (serverErrors !== seenServerErrors) {
    setSeenServerErrors(serverErrors)
    const target = firstStepWith(serverErrors)
    if (target !== null && target !== step) {
      setDirection(target > step ? 'forward' : 'back')
      setStep(target)
    }
  }

  // Once a gate has been shown it stays in the step count, so finishing it reads as progress ("Step 2 of 6").
  const gateKey = gate?.key ?? null
  const [seenGateKey, setSeenGateKey] = useState(gateKey)
  const [gateCounted, setGateCounted] = useState(gateKey !== null)
  if (gateKey !== seenGateKey) {
    setSeenGateKey(gateKey)
    if (gateKey !== null) setGateCounted(true)
    setDirection(gateKey === null || seenGateKey !== null ? 'forward' : 'back')
  }
  const offset = gateCounted ? 1 : 0
  const totalSteps = STEPS.length + offset
  const position = gate ? 0 : step + offset

  // Move focus to each new screen so keyboard and screen-reader users land on it, but not on first load.
  useEffect(() => {
    if (direction) titleRef.current?.focus()
  }, [step, direction, gateKey])

  const catalogue = races.kind === 'ready' ? races.races : []
  const chosenRace = catalogue.find((r) => r.slug === draft.race)
  const targetKm = chosenRace?.distanceKm ?? (draft.race === OTHER && Number(draft.otherKm) > 0 ? toKilometres(Number(draft.otherKm), units) : null)
  const goalSeconds = durationSeconds(draft.goal)
  const errors: FieldErrors = { ...serverErrors, ...clientErrors }
  const stepErrors = Object.values(onStep(errors, step)).filter(Boolean)

  const raceDate = chosenRace?.date ?? (draft.race === OTHER && draft.otherDate ? draft.otherDate : null)
  const pacePreview = targetKm && goalSeconds > 0 ? `That’s ${formatPace(goalSeconds / targetKm, units)} on average.` : undefined

  const setRunDays = (days: DayOfWeek[]) =>
    setDraft((d) => ({ ...d, runDays: days, longRunDay: d.longRunDay && days.includes(d.longRunDay) ? d.longRunDay : null }))

  const goTo = (next: number, keepErrors: FieldErrors = {}) => {
    setClientErrors(keepErrors)
    setDirection(next > step ? 'forward' : 'back')
    setStep(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validate(draft, goalSeconds, today, raceDate)

    if (step < LAST_STEP) {
      const here = onStep(found, step)
      if (Object.keys(here).length > 0) {
        setClientErrors(here)
        titleRef.current?.focus()
        return
      }
      goTo(step + 1)
      return
    }

    const target = firstStepWith(found)
    if (target !== null || !draft.longRunDay) {
      goTo(target ?? 2, found)
      return
    }

    setClientErrors({})
    const currentKm = Number(draft.currentKm)
    onSubmit({
      raceSlug: draft.race === OTHER ? undefined : draft.race,
      raceName: draft.race === OTHER ? draft.otherName.trim() || undefined : undefined,
      distanceKm: draft.race === OTHER ? toKilometres(Number(draft.otherKm), units) : undefined,
      raceDate: draft.race === OTHER ? draft.otherDate : undefined,
      goalSeconds,
      runDays: draft.runDays,
      longRunDay: draft.longRunDay,
      currentWeeklyKm: currentKm > 0 ? toKilometres(currentKm, units) : undefined,
      experience: draft.experience,
      strengthDays: draft.strengthDays,
      planFrom: today,
      // A new plan: built with the newest generator, and stamped with it so its link keeps that shape.
      version: LATEST_PLAN_VERSION,
      recent: recentInputs(draft.recent, today),
      startOn: draft.start === 'today' ? today : draft.start === 'day' ? draft.startOn : undefined,
    })
  }

  const current = STEPS[step]!
  const otherKm = Number(draft.otherKm)
  const raceSummary = chosenRace
    ? `${chosenRace.name}, ${formatDate(chosenRace.date, 'long')}`
    : `${draft.otherName.trim() || 'Your race'}: ${otherKm > 0 ? formatDistance(toKilometres(otherKm, units), units) : '?'}${
        draft.otherDate ? `, ${formatDate(draft.otherDate, 'long')}` : ''
      }`
  const experience = EXPERIENCE.find((e) => e.value === draft.experience)!

  const reviewRow = (label: string, value: ReactNode, target: number) => (
    <div className="review-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <button type="button" className="link-button" onClick={() => goTo(target)} aria-label={`Change ${label.toLowerCase()}`}>
        Change
      </button>
    </div>
  )

  const slide = `wizard-panel${direction ? ` slide-${direction}` : ''}`

  return (
    <div className="builder wizard">
      {position === 0 && intro}

      <div className="wizard-progress">
        <p className="wizard-count">
          Step {position + 1} of {totalSteps}
        </p>
        {/* The taper again: the bars step down towards the last step, which is a race-day dot. */}
        <ol className="wizard-bar" aria-hidden="true">
          {Array.from({ length: totalSteps }, (_, i) => (
            <li
              key={i}
              className={i <= position ? 'is-done' : undefined}
              style={i < totalSteps - 1 ? { height: `${16 - (9 * i) / Math.max(totalSteps - 2, 1)}px` } : undefined}
            />
          ))}
        </ol>
        {onCancel && !gate && (
          <button type="button" className="link-button wizard-cancel" onClick={onCancel}>
            Back to your plan
          </button>
        )}
      </div>

      <div className="wizard-viewport">
        {gate ? (
          <section key={`gate-${gate.key}`} className={slide} aria-labelledby={`${id}-title`}>
            <h2 className="wizard-title" id={`${id}-title`} ref={titleRef} tabIndex={-1}>
              {gate.title}
            </h2>
            <p className="wizard-hint">{gate.hint}</p>
            {gate.body}
          </section>
        ) : (
          <form onSubmit={submit} noValidate aria-label="Build your plan">
            <section key={step} className={slide} aria-labelledby={`${id}-title`}>
              <h2 className="wizard-title" id={`${id}-title`} ref={titleRef} tabIndex={-1}>
                {current.title}
              </h2>
              <p className="wizard-hint">{current.hint}</p>
    
              {stepErrors.length > 0 && (
                <div className="form-errors" role="alert">
                  <h3>{stepErrors.length === 1 ? 'One thing to fix' : 'A few things to fix'}</h3>
                  <ul>
                    {stepErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}
    
              {step === 0 && (
                <>
                  <div className="choice-list" role="radiogroup" aria-label="Race" aria-describedby={errors.race ? 'race-error' : undefined}>
                    {races.kind === 'loading' && [0, 1, 2].map((i) => <div className="skeleton" key={i} aria-hidden="true" />)}
                    {races.kind === 'loading' && <span className="visually-hidden">Loading races…</span>}
    
                    {races.kind === 'error' && (
                      <div className="error-panel">
                        <strong>We couldn’t load the race list.</strong>
                        <p>{races.message} You can still enter any race below.</p>
                        <button type="button" className="button button-quiet" onClick={onRetryRaces} style={{ marginTop: 'var(--space-3)' }}>
                          Try again
                        </button>
                      </div>
                    )}
    
                    {catalogue.length > 0 && (
                      // The race rack: bibs hang from hooks on a rail and sway. The label stays put; only its card
                      // swings, and the radio underneath does the work for keyboards and screen readers.
                      <div className="race-rack">
                        {catalogue.map((race, i) => (
                          <label className="race-bib" key={race.slug}>
                            <input type="radio" name="race" value={race.slug} checked={draft.race === race.slug} onChange={() => set('race', race.slug)} />
                            <span className={`bib-card bib-colour-${i % 4}`} style={{ animationDelay: `-${(i * 1.1).toFixed(1)}s` }}>
                              <span className="choice-date mono">
                                {formatDate(race.date, 'dayMonth')} <small>{formatDate(race.date, 'year')}</small>
                              </span>
                              <span className="choice-name">{race.name}</span>
                              <span className="choice-meta">
                                {race.distanceConfirmed ? '' : 'About '}
                                {formatDistance(race.distanceKm, units)} · {race.location}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
    
                    <label className="choice choice-other">
                      <input type="radio" name="race" value={OTHER} checked={draft.race === OTHER} onChange={() => set('race', OTHER)} />
                      <span className="choice-name">Another race</span>
                      <span className="choice-meta">Any distance, any date: a parkrun PB, a local half, your first ultra.</span>
                    </label>
                  </div>
                  <FieldError id="race-error" message={errors.race} />
    
                  {draft.race === OTHER && (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                      <div className="field">
                        <span className="field-label" id="distance-label">
                          Distance ({units})
                        </span>
                        <div className="pills" role="group" aria-labelledby="distance-label">
                          {SHORTCUTS.map((s) => {
                            const value = String(Math.round((units === 'mi' ? s.km / 1.609344 : s.km) * 100) / 100)
                            return (
                              <label className="pill" key={s.label}>
                                <input type="radio" name="distance-shortcut" checked={draft.otherKm === value} onChange={() => set('otherKm', value)} />
                                {s.label}
                              </label>
                            )
                          })}
                        </div>
                        <input
                          className="input"
                          aria-labelledby="distance-label"
                          inputMode="decimal"
                          placeholder={`Or type it, e.g. ${units === 'mi' ? '35' : '56'}`}
                          value={draft.otherKm}
                          aria-invalid={errors.distance ? true : undefined}
                          onChange={(e) => set('otherKm', e.target.value.replace(/[^\d.]/g, ''))}
                        />
                        <FieldError id="distance-error" message={errors.distance} />
                      </div>
                      <div className="row">
                        <div className="field">
                          <label className="field-label" htmlFor="race-date">
                            Race date
                          </label>
                          <DatePicker
                            id="race-date"
                            value={draft.otherDate}
                            onChange={(d) => set('otherDate', d)}
                            min={addDays(today, 14)}
                            max={addDays(today, 2 * 365)}
                            today={today}
                            invalid={!!errors.date}
                            describedBy={errors.date ? 'date-error' : undefined}
                          />
                          <FieldError id="date-error" message={errors.date} />
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="race-name">
                            Name <span className="field-help">(optional)</span>
                          </label>
                          <input id="race-name" className="input" maxLength={100} value={draft.otherName} onChange={(e) => set('otherName', e.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
    
              {step === 1 && (
                <>
                  <DurationInput legend="Goal finish time" value={draft.goal} onChange={(v) => set('goal', v)} error={errors.goal} help={pacePreview} />
                  <details className="disclosure">
                    <summary>Add a recent race, so the coach can tell you if your goal is realistic</summary>
                    <p className="field-help">Optional. A race or time trial from the last six weeks, at least 3 km. It never changes your plan: it lets the coach say whether {goalSeconds > 0 ? formatDuration(goalSeconds) : 'your goal'} is realistic, or whether you could aim higher.</p>
                    <GoalEstimator targetKm={targetKm} value={draft.recent} onChange={(v) => set('recent', v)} onUse={(seconds) => set('goal', toDuration(seconds))} />
                  </details>
                </>
              )}
    
              {step === 2 && (
                <>
                  <DayPills legend="Which days can you run?" hint="Three to seven." selected={draft.runDays} onChange={setRunDays} error={errors.runDays} />
                  <DayChoice
                    legend="Which one is your long run?"
                    days={draft.runDays}
                    value={draft.longRunDay}
                    onChange={(d) => set('longRunDay', d)}
                    error={errors.longRunDay}
                  />
                  <StartDay
                    draft={draft}
                    today={today}
                    raceDate={raceDate}
                    onChange={(start, startOn) => setDraft((d) => ({ ...d, start, startOn }))}
                    error={errors.startOn}
                  />
                </>
              )}
    
              {step === 3 && (
                <>
                  <div className="segmented" role="radiogroup" aria-label="Running experience">
                    {EXPERIENCE.map((e) => (
                      <label className="segment" key={e.value}>
                        <input type="radio" name="experience" checked={draft.experience === e.value} onChange={() => set('experience', e.value)} />
                        <strong>{e.title}</strong>
                        <span>{e.note}</span>
                      </label>
                    ))}
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="current-km">
                      Roughly how far do you run a week now? <span className="field-help">(optional, {units})</span>
                    </label>
                    <input
                      id="current-km"
                      className="input"
                      inputMode="decimal"
                      value={draft.currentKm}
                      onChange={(e) => set('currentKm', e.target.value.replace(/[^\d.]/g, ''))}
                      style={{ maxWidth: '10rem' }}
                    />
                    <p className="field-help">We build from here by no more than 10% a week.</p>
                    <FieldError id="km-error" message={errors.currentKm} />
                  </div>
                </>
              )}
    
              {step === LAST_STEP && (
                <>
                  <dl className="review">
                    {reviewRow('Race', raceSummary, 0)}
                    {reviewRow('Goal', `${formatDuration(goalSeconds)}${pacePreview ? `. ${pacePreview}` : ''}`, 1)}
                    {recentInputs(draft.recent, today) && reviewRow('Recent race', describeRecent(draft.recent, formatDuration(durationSeconds(draft.recent.time))), 1)}
                    {reviewRow('Days', `${dayList(draft.runDays)}. Long run on ${draft.longRunDay ?? '?'}.`, 2)}
                    {reviewRow('Start', startSummary(draft, today), 2)}
                    {reviewRow(
                      'You',
                      `${experience.title} runner${Number(draft.currentKm) > 0 ? `, about ${draft.currentKm} ${units} a week now` : ''}.`,
                      3,
                    )}
                  </dl>
                  <details className="disclosure" open={draft.strengthDays.length > 0}>
                    <summary>Add strength and mobility sessions</summary>
                    <DayPills
                      legend="Strength days"
                      hint="Up to three, about 30 minutes each."
                      selected={draft.strengthDays}
                      onChange={(d) => set('strengthDays', d)}
                      max={3}
                      error={errors.strength}
                    />
                  </details>
                  <p className="field-help">Your plan also lives in its link, so you can share it with anyone.</p>
                </>
              )}
            </section>
    
            <div className="wizard-nav">
              {step > 0 ? (
                <button type="button" className="button button-quiet" onClick={() => goTo(step - 1)}>
                  Back
                </button>
              ) : (
                <span />
              )}
              <button type="submit" className="button button-primary" disabled={busy} aria-busy={busy}>
                {step < LAST_STEP ? 'Continue' : busy ? 'Building your plan…' : 'Build my plan'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
