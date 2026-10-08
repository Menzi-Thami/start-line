import { useMemo, useState, type FormEvent } from 'react'
import { formatDate, formatDistance, formatPace, toKilometres, type Units } from '../../lib/format'
import type { PlanInputs } from '../../lib/plan-url'
import type { DayOfWeek, Experience, Race } from '../../lib/types'
import { DayChoice, DayPills, DurationInput, FieldError } from './controls'
import { durationSeconds, toDuration, type Duration } from './duration'
import { GoalEstimator } from './GoalEstimator'

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

export type FieldErrors = Partial<Record<'race' | 'distance' | 'date' | 'goal' | 'runDays' | 'longRunDay' | 'currentKm' | 'strength', string>>

interface Props {
  races: RacesState
  onRetryRaces: () => void
  initial: PlanInputs | null
  units: Units
  busy: boolean
  serverErrors: FieldErrors
  today: string
  onSubmit: (inputs: PlanInputs) => void
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
}

function draftFrom(initial: PlanInputs | null, units: Units): Draft {
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
  }
}

export function BuilderForm({ races, onRetryRaces, initial, units, busy, serverErrors, today, onSubmit }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial, units))
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const catalogue = races.kind === 'ready' ? races.races : []
  const chosenRace = catalogue.find((r) => r.slug === draft.race)
  const targetKm = chosenRace?.distanceKm ?? (draft.race === OTHER && Number(draft.otherKm) > 0 ? toKilometres(Number(draft.otherKm), units) : null)
  const goalSeconds = durationSeconds(draft.goal)
  const errors: FieldErrors = { ...serverErrors, ...clientErrors }

  const pacePreview = useMemo(
    () => (targetKm && goalSeconds > 0 ? `That’s ${formatPace(goalSeconds / targetKm, units)} on average.` : undefined),
    [targetKm, goalSeconds, units],
  )

  const setRunDays = (days: DayOfWeek[]) =>
    setDraft((d) => ({ ...d, runDays: days, longRunDay: d.longRunDay && days.includes(d.longRunDay) ? d.longRunDay : null }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: FieldErrors = {}
    if (!draft.race) found.race = 'Choose a race, or pick "another race" and tell us about it.'
    if (draft.race === OTHER) {
      const km = Number(draft.otherKm)
      if (!(km > 0)) found.distance = 'Enter the race distance.'
      if (!draft.otherDate) found.date = 'Enter the race date.'
    }
    if (goalSeconds <= 0) found.goal = 'Enter a goal time. Not sure? Use the estimate below.'
    if (draft.runDays.length < 3) found.runDays = 'Pick at least three days. Two runs a week isn’t enough to build on.'
    if (!draft.longRunDay) found.longRunDay = 'Pick which of your days is the long run.'

    setClientErrors(found)
    if (Object.keys(found).length > 0 || !draft.longRunDay) return

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
    })
  }

  const summary = Object.values(errors).filter(Boolean)

  return (
    <form className="builder" onSubmit={submit} noValidate>
      {summary.length > 0 && (
        <div className="form-errors" role="alert">
          <h2>A few things to fix</h2>
          <ul>
            {summary.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <fieldset className="step">
        <legend className="step-head">
          <span className="step-number">1</span>
          <span className="step-title">Which race?</span>
        </legend>

        <div className="choice-list" role="radiogroup" aria-label="Race" aria-describedby={errors.race ? 'race-error' : undefined}>
          {races.kind === 'loading' &&
            [0, 1, 2].map((i) => <div className="skeleton" key={i} aria-hidden="true" />)}
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

          {catalogue.map((race) => (
            <label className="choice" key={race.slug}>
              <input type="radio" name="race" value={race.slug} checked={draft.race === race.slug} onChange={() => set('race', race.slug)} />
              <span className="choice-date">
                {formatDate(race.date, 'dayMonth')}
                <small>{formatDate(race.date, 'year')}</small>
              </span>
              <span className="choice-name">{race.name}</span>
              <span className="choice-meta">
                {formatDistance(race.distanceKm, units)} · {race.location}
              </span>
            </label>
          ))}

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
                <input
                  id="race-date"
                  className="input"
                  type="date"
                  min={today}
                  value={draft.otherDate}
                  aria-invalid={errors.date ? true : undefined}
                  onChange={(e) => set('otherDate', e.target.value)}
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
      </fieldset>

      <fieldset className="step">
        <legend className="step-head">
          <span className="step-number">2</span>
          <span className="step-title">What’s your goal time?</span>
        </legend>
        <DurationInput legend="Goal finish time" value={draft.goal} onChange={(v) => set('goal', v)} error={errors.goal} help={pacePreview} />
        <details className="disclosure">
          <summary>Not sure? Estimate it from a recent race</summary>
          <GoalEstimator targetKm={targetKm} onUse={(seconds) => set('goal', toDuration(seconds))} />
        </details>
      </fieldset>

      <fieldset className="step">
        <legend className="step-head">
          <span className="step-number">3</span>
          <span className="step-title">Your week</span>
        </legend>
        <DayPills
          legend="Which days can you run?"
          hint="Three to seven. Hard sessions go on days that aren’t back to back, wherever your choice allows."
          selected={draft.runDays}
          onChange={setRunDays}
          error={errors.runDays}
        />
        <DayChoice
          legend="Which one is your long run?"
          days={draft.runDays}
          value={draft.longRunDay}
          onChange={(d) => set('longRunDay', d)}
          error={errors.longRunDay}
        />
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
      </fieldset>

      <fieldset className="step">
        <legend className="step-head">
          <span className="step-number">4</span>
          <span className="step-title">About you</span>
        </legend>
        <div className="segmented" role="radiogroup" aria-label="Running experience">
          {EXPERIENCE.map((e) => (
            <label className="segment" key={e.value}>
              <input type="radio" name="experience" checked={draft.experience === e.value} onChange={() => set('experience', e.value)} />
              <strong>{e.title}</strong>
              <span>{e.note}</span>
            </label>
          ))}
        </div>
        <details className="disclosure" open={draft.strengthDays.length > 0}>
          <summary>Add strength and mobility sessions</summary>
          <DayPills
            legend="Strength days"
            hint="Up to three, about 30 minutes each. Pairing them with a hard run day keeps your easy days easy."
            selected={draft.strengthDays}
            onChange={(d) => set('strengthDays', d)}
            max={3}
            error={errors.strength}
          />
        </details>
      </fieldset>

      <div className="submit-row">
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? 'Building your plan…' : 'Build my plan'}
        </button>
        <span className="field-help">Free, no sign-up. Your plan lives in the link.</span>
      </div>
    </form>
  )
}
