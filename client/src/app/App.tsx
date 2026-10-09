import { useCallback, useEffect, useRef, useState } from 'react'
import { BuilderForm, type FieldErrors, type RacesState } from '../features/builder/BuilderForm'
import { PlanView } from '../features/plan/PlanView'
import { api, ApiError } from '../lib/api-client'
import { localToday, type Units } from '../lib/format'
import { fromSearchParams, toRequest, toSearchParams, type PlanInputs } from '../lib/plan-url'
import { loadUnits, saveUnits } from '../lib/storage'
import type { TrainingPlan } from '../lib/types'

type PlanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; plan: TrainingPlan; inputs: PlanInputs }
  | { kind: 'error'; message: string; inputs: PlanInputs }

// Server field names (from ValidationProblemDetails) to the form's fields.
const FIELD_FOR: Record<string, keyof FieldErrors> = {
  RaceSlug: 'race',
  PlanFrom: 'race',
  DistanceKm: 'distance',
  RaceDate: 'date',
  RaceName: 'race',
  GoalTime: 'goal',
  RunDays: 'runDays',
  LongRunDay: 'longRunDay',
  CurrentWeeklyKm: 'currentKm',
  StrengthDays: 'strength',
}

function toFieldErrors(errors: Record<string, string[]>): FieldErrors {
  const mapped: FieldErrors = {}
  for (const [key, messages] of Object.entries(errors)) {
    const field = FIELD_FOR[key.replace(/\[\d+\]$/, '')] ?? FIELD_FOR[key.split('.')[0] ?? '']
    if (field && messages[0]) mapped[field] ??= messages[0]
  }
  return mapped
}

export function App() {
  const today = localToday()
  const [initial] = useState(() => fromSearchParams(new URLSearchParams(window.location.search)))
  const [units, setUnits] = useState<Units>(loadUnits)
  const [races, setRaces] = useState<RacesState>({ kind: 'loading' })
  // A shared link starts building straight away, so it opens in the loading state.
  const [plan, setPlan] = useState<PlanState>(() => (initial ? { kind: 'loading' } : { kind: 'idle' }))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const inflight = useRef<AbortController | null>(null)

  // Only sets state once the request settles; callers set the loading state themselves.
  const fetchRaces = useCallback((controller: AbortController) => {
    api
      .races(controller.signal)
      .then((list) => setRaces({ kind: 'ready', races: list }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRaces({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' })
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchRaces(controller)
    return () => controller.abort()
  }, [fetchRaces])

  const retryRaces = () => {
    setRaces({ kind: 'loading' })
    fetchRaces(new AbortController())
  }

  // Like fetchRaces: state changes only when the request settles.
  const fetchPlan = useCallback((inputs: PlanInputs) => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller

    const withDate = { ...inputs, planFrom: inputs.planFrom ?? localToday() }
    window.history.replaceState(null, '', `?${toSearchParams(withDate)}`)

    api
      .plan(toRequest(withDate), controller.signal)
      .then((result) => setPlan({ kind: 'ready', plan: result, inputs: withDate }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
          setFieldErrors(toFieldErrors(error.fieldErrors))
          setPlan({ kind: 'idle' })
          document.querySelector('.builder')?.scrollIntoView?.({ block: 'start' })
          return
        }
        setPlan({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.', inputs: withDate })
      })
  }, [])

  const build = (inputs: PlanInputs) => {
    setFieldErrors({})
    setPlan({ kind: 'loading' })
    fetchPlan(inputs)
  }

  // A shared link builds its plan straight away.
  useEffect(() => {
    if (initial) fetchPlan(initial)
    return () => inflight.current?.abort()
  }, [initial, fetchPlan])

  const changeUnits = (next: Units) => {
    setUnits(next)
    saveUnits(next)
  }

  return (
    <div className="page">
      <header className="masthead">
        <span className="wordmark">
          <svg className="wordmark-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path d="M6 22h20" stroke="var(--on-accent)" strokeWidth="3" strokeLinecap="round" />
            <path d="M10 10v12M16 10v12M22 10v12" stroke="var(--on-accent)" strokeOpacity=".45" strokeWidth="2" />
          </svg>
          Start Line
        </span>
      </header>

      <main>
        <div className="intro">
          <h1>
            You’ve entered the race. <em>Let’s get you to the start.</em>
          </h1>
          <p>
            Tell us the race, your goal and the days you can run. You’ll get a week-by-week plan with a pace and a reason for
            every session. No account, no app, nothing to pay.
          </p>
        </div>

        <BuilderForm
          races={races}
          onRetryRaces={retryRaces}
          initial={initial}
          units={units}
          busy={plan.kind === 'loading'}
          serverErrors={fieldErrors}
          today={today}
          onSubmit={build}
        />

        <div aria-live="polite" aria-busy={plan.kind === 'loading'}>
          {plan.kind === 'loading' && <p className="visually-hidden">Building your plan…</p>}
          {plan.kind === 'error' && (
            <div className="error-panel" style={{ marginTop: 'var(--space-7)' }} role="alert">
              <strong>We couldn’t build that plan.</strong>
              <p>{plan.message}</p>
              <button
                type="button"
                className="button button-quiet"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={() => build(plan.inputs)}
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {plan.kind === 'ready' && (
          <PlanView
            key={`${plan.plan.race.name}|${plan.plan.race.date}|${plan.plan.startDate}`}
            plan={plan.plan}
            units={units}
            onUnitsChange={changeUnits}
            shareUrl={`${window.location.origin}${window.location.pathname}?${toSearchParams(plan.inputs)}`}
            today={today}
          />
        )}
      </main>

      <footer className="footer">
        <p>
          Plans are a guide, not medical advice. If something hurts in a way that isn’t normal tiredness, rest and get it checked.
          Race dates come from organisers and can change, so confirm on the race’s own site before you enter.
        </p>
      </footer>
    </div>
  )
}
