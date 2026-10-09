import { useCallback, useEffect, useRef, useState } from 'react'
import { AccountPage } from '../features/account/AccountPage'
import { MyPlans } from '../features/account/MyPlans'
import { ProfileForm } from '../features/account/ProfileForm'
import { SavePlanButton } from '../features/account/SavePlanButton'
import { useRunner } from '../features/account/useRunner'
import { BuilderForm, type FieldErrors, type RacesState } from '../features/builder/BuilderForm'
import { PlanView } from '../features/plan/PlanView'
import { api, ApiError } from '../lib/api-client'
import { localToday, type Units } from '../lib/format'
import { fromRequest, fromSearchParams, toRequest, toSearchParams, type PlanInputs } from '../lib/plan-url'
import { loadUnits, saveUnits } from '../lib/storage'
import type { GeneratePlanRequest, TrainingPlan } from '../lib/types'
import { useAuth } from './auth-context'

type PlanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; plan: TrainingPlan; inputs: PlanInputs }
  | { kind: 'error'; message: string; inputs: PlanInputs }

type View = 'build' | 'plans' | 'account' | 'sign-up'

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

const viewFromUrl = (): View => {
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'plans' || view === 'account' ? view : 'build'
}

export function App() {
  const today = localToday()
  const auth = useAuth()
  const runner = useRunner()
  const [initial] = useState(() => fromSearchParams(new URLSearchParams(window.location.search)))
  const [view, setView] = useState<View>(viewFromUrl)
  const [units, setUnits] = useState<Units>(loadUnits)
  const [races, setRaces] = useState<RacesState>({ kind: 'loading' })
  // A shared link starts building straight away, so it opens in the loading state.
  const [plan, setPlan] = useState<PlanState>(() => (initial ? { kind: 'loading' } : { kind: 'idle' }))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [builderKey, setBuilderKey] = useState(0)
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

  const go = (next: View) => {
    setView(next)
    // The build view keeps the plan link in the URL; the others get a plain view parameter.
    const query =
      next === 'plans' || next === 'account'
        ? `?view=${next}`
        : plan.kind === 'ready' || plan.kind === 'error'
          ? `?${toSearchParams(plan.inputs)}`
          : ''
    window.history.replaceState(null, '', query || window.location.pathname)
    window.scrollTo?.({ top: 0 })
  }

  const openSaved = (request: GeneratePlanRequest) => {
    const inputs = fromRequest(request)
    if (!inputs) return
    setView('build')
    // Remount the form so it shows the saved plan's choices, not whatever was typed before.
    setBuilderKey((k) => k + 1)
    build(inputs)
  }

  const changeUnits = (next: Units) => {
    setUnits(next)
    saveUnits(next)
  }

  const state = runner.state
  const builderInitial = plan.kind === 'ready' || plan.kind === 'error' ? plan.inputs : initial

  return (
    <div className="page">
      <header className="masthead">
        <button type="button" className="wordmark wordmark-button" onClick={() => go('build')}>
          <svg className="wordmark-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path d="M6 22h20" stroke="var(--on-accent)" strokeWidth="3" strokeLinecap="round" />
            <path d="M10 10v12M16 10v12M22 10v12" stroke="var(--on-accent)" strokeOpacity=".45" strokeWidth="2" />
          </svg>
          Start Line
        </button>

        {state.kind !== 'off' && (
          <nav className="masthead-nav" aria-label="Account">
            {state.kind === 'signed-out' && (
              <button type="button" className="button button-quiet" onClick={auth.signIn}>
                Sign in
              </button>
            )}
            {(state.kind === 'ready' || state.kind === 'needs-sign-up' || state.kind === 'error') && (
              <>
                {state.kind === 'ready' && (
                  <>
                    <button type="button" className="nav-link" aria-current={view === 'plans' ? 'page' : undefined} onClick={() => go('plans')}>
                      My plans
                    </button>
                    <button type="button" className="nav-link" aria-current={view === 'account' ? 'page' : undefined} onClick={() => go('account')}>
                      Account
                    </button>
                  </>
                )}
                <button type="button" className="nav-link" onClick={auth.signOut}>
                  Sign out
                </button>
              </>
            )}
          </nav>
        )}
      </header>

      <main>
        {state.kind === 'needs-sign-up' && view !== 'sign-up' && (
          <div className="callout" role="note">
            <p>
              You’re signed in. One more step to save plans:{' '}
              <button type="button" className="link-button" onClick={() => go('sign-up')}>
                finish signing up
              </button>
              .
            </p>
          </div>
        )}
        {state.kind === 'error' && (
          <div className="callout" role="alert">
            <p>
              We couldn’t load your account. {state.message}{' '}
              <button type="button" className="link-button" onClick={() => runner.refresh()}>
                Try again
              </button>
            </p>
          </div>
        )}

        {view === 'sign-up' && state.kind === 'needs-sign-up' && (
          <section aria-labelledby="sign-up-title" style={{ marginBottom: 'var(--space-7)' }}>
            <h2 className="plan-title" id="sign-up-title">
              Finish signing up
            </h2>
            <p className="plan-focus">Two quick things, then your plans are saved to your account.</p>
            <ProfileForm
              onSaved={(saved) => {
                runner.setRunner(saved)
                go('build')
              }}
            />
          </section>
        )}

        {view === 'plans' && state.kind === 'ready' && <MyPlans onOpen={openSaved} onBuildNew={() => go('build')} />}

        {view === 'account' && state.kind === 'ready' && (
          <AccountPage
            runner={state.runner}
            onSaved={runner.setRunner}
            onDeleted={() => {
              go('build')
              auth.signOut()
            }}
          />
        )}

        {(view === 'plans' || view === 'account') && (state.kind === 'signed-out' || state.kind === 'off') && (
          <div className="empty">
            <p>Sign in to see your saved plans and account.</p>
            {state.kind === 'signed-out' && (
              <button type="button" className="button" onClick={auth.signIn} style={{ marginTop: 'var(--space-3)' }}>
                Sign in
              </button>
            )}
          </div>
        )}

        {(view === 'build' || view === 'sign-up') && (
          <>
            {view === 'build' && (
              <div className="intro">
                <h1>
                  You’ve entered the race. <em>Let’s get you to the start.</em>
                </h1>
                <p>
                  Tell us the race, your goal and the days you can run. You’ll get a week-by-week plan with a pace and a reason
                  for every session. No account, no app, nothing to pay.
                </p>
              </div>
            )}

            {view === 'build' && (
              <BuilderForm
                key={builderKey}
                races={races}
                onRetryRaces={retryRaces}
                initial={builderInitial}
                units={units}
                busy={plan.kind === 'loading'}
                serverErrors={fieldErrors}
                today={today}
                onSubmit={build}
              />
            )}

            <div aria-live="polite" aria-busy={plan.kind === 'loading'}>
              {plan.kind === 'loading' && <p className="visually-hidden">Building your plan…</p>}
              {plan.kind === 'error' && view === 'build' && (
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

            {plan.kind === 'ready' && view === 'build' && (
              <PlanView
                key={`${plan.plan.race.name}|${plan.plan.race.date}|${plan.plan.startDate}`}
                plan={plan.plan}
                units={units}
                onUnitsChange={changeUnits}
                shareUrl={`${window.location.origin}${window.location.pathname}?${toSearchParams(plan.inputs)}`}
                today={today}
                toolbarExtra={
                  <SavePlanButton
                    key={toSearchParams(plan.inputs).toString()}
                    runner={state}
                    request={toRequest(plan.inputs)}
                    onOpenMyPlans={() => go('plans')}
                    onFinishSignUp={() => go('sign-up')}
                  />
                }
              />
            )}
          </>
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
