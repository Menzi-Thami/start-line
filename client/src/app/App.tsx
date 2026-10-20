import { useCallback, useEffect, useRef, useState } from 'react'
import { AccountPage } from '../features/account/AccountPage'
import { MyPlans } from '../features/account/MyPlans'
import { ProfileForm } from '../features/account/ProfileForm'
import { SavePlanButton } from '../features/account/SavePlanButton'
import { SignUpPitch } from '../features/account/SignUpPitch'
import { StartListCelebration } from '../features/account/StartListCelebration'
import { useCurrentPlan } from '../features/account/useCurrentPlan'
import { useRunner } from '../features/account/useRunner'
import { SignInWait } from '../features/account/SignInWait'
import { ActivityPage } from '../features/activities/ActivityPage'
import { MyRuns } from '../features/activities/MyRuns'
import { BuilderForm, type FieldErrors, type Gate, type RacesState } from '../features/builder/BuilderForm'
import { Hero, RaceTicker } from '../features/home/Hero'
import { RaceStartIntro } from '../features/home/RaceStartIntro'
import { PlanView } from '../features/plan/PlanView'
import { readStravaCallback, STRAVA_CALLBACK_PATH } from '../features/sync/strava-callback'
import { useSyncedRuns } from '../features/sync/useSyncedRuns'
import { api, ApiError, apiOrigin } from '../lib/api-client'
import { calendarLinks } from '../lib/calendar-links'
import { localToday, type Units } from '../lib/format'
import { fromRequest, fromSearchParams, toRequest, toSearchParams, type PlanInputs } from '../lib/plan-url'
import { introSeen, markIntroSeen, prefersMotion } from '../lib/motion'
import { loadUnits, saveUnits } from '../lib/storage'
import type { Activity, GeneratePlanRequest, Runner, TrainingPlan } from '../lib/types'
import { useAuth } from './auth-context'

type PlanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; plan: TrainingPlan; inputs: PlanInputs }
  | { kind: 'error'; message: string; inputs: PlanInputs }

type View = 'build' | 'plans' | 'runs' | 'account' | 'sign-up'

/** The run open on the runs view; a fresh upload carries its data so it opens without a second request. */
type OpenRun = { id: string; uploaded?: Activity }

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

const runFromUrl = (): OpenRun | null => {
  const params = new URLSearchParams(window.location.search)
  const id = params.get('view') === 'runs' ? params.get('run') : null
  return id ? { id } : null
}

const viewFromUrl = (): View => {
  if (window.location.pathname === STRAVA_CALLBACK_PATH) return 'account'
  const view = new URLSearchParams(window.location.search).get('view')
  return view === 'plans' || view === 'runs' || view === 'account' ? view : 'build'
}

export function App() {
  const today = localToday()
  const auth = useAuth()
  const runner = useRunner()
  const [initial] = useState(() => fromSearchParams(new URLSearchParams(window.location.search)))
  const [view, setView] = useState<View>(viewFromUrl)
  const [openRun, setOpenRun] = useState<OpenRun | null>(runFromUrl)
  // Strava's answer when the runner comes back from connecting, read once and handled when they're signed in.
  const [stravaCallback] = useState(() => readStravaCallback(window.location))
  const stravaHandled = useRef(false)
  const [stravaNotice, setStravaNotice] = useState<string | null>(null)
  // True from the moment Strava sends the runner back until the connection is saved, so Account says so meanwhile.
  const [stravaConnecting, setStravaConnecting] = useState(() => stravaCallback !== null && !stravaCallback.error && !!stravaCallback.code)
  const [units, setUnits] = useState<Units>(loadUnits)
  const [races, setRaces] = useState<RacesState>({ kind: 'loading' })
  // A shared link starts building straight away, so it opens in the loading state.
  const [plan, setPlan] = useState<PlanState>(() => (initial ? { kind: 'loading' } : { kind: 'idle' }))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [builderKey, setBuilderKey] = useState(0)
  // True while the wizard is open over a plan (or about to produce one). A built plan replaces the wizard.
  const [editing, setEditing] = useState(false)
  const [freshBuild, setFreshBuild] = useState(false)
  // The starting-gun intro: once per visit, only when landing on the builder, never for reduced motion.
  const [playIntro, setPlayIntro] = useState(() => !initial && prefersMotion() && !introSeen())
  const finishIntro = useCallback(() => setPlayIntro(false), [])
  // Who just made the start list, while their celebration plays.
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const finishCelebrating = useCallback(() => setCelebrating(null), [])
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
      .then((result) => {
        setPlan({ kind: 'ready', plan: result, inputs: withDate })
        setEditing(false)
        window.scrollTo?.({ top: 0 })
      })
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

  const buildFromWizard = (inputs: PlanInputs) => {
    // A brand-new plan is saved to the runner's account as soon as it's built; a re-run of changed answers isn't,
    // so trying a different goal doesn't fill My plans with near-copies.
    setFreshBuild(plan.kind !== 'ready')
    setEditing(true)
    build(inputs)
  }

  const changeAnswers = () => {
    // Remount so the wizard starts from this plan's answers, on its summary screen.
    setBuilderKey((k) => k + 1)
    setEditing(true)
    window.scrollTo?.({ top: 0 })
  }

  const backToPlan = () => {
    setEditing(false)
    window.scrollTo?.({ top: 0 })
  }

  useEffect(() => {
    if (playIntro) markIntroSeen()
  }, [playIntro])

  // The runner's runs (uploaded and synced), bests and Strava status, shown inside the plan. Loaded when the plan
  // view opens, so a new upload or a run that just arrived from Strava appears.
  const synced = useSyncedRuns(runner.state.kind === 'ready' && view === 'build')
  const currentPlan = useCurrentPlan(runner.state.kind === 'ready')
  const landing = useRef(false)
  const [landed, setLanded] = useState(false)
  // Someone who has just signed up has no plan to open, so the builder never waits for one.
  const [justSignedUp, setJustSignedUp] = useState(false)
  const runs = synced.runs

  // Back from Strava: finish connecting, then show the account page with what happened.
  useEffect(() => {
    if (!stravaCallback || stravaHandled.current || runner.state.kind !== 'ready') return
    stravaHandled.current = true
    window.history.replaceState(null, '', '/?view=account')
    const { code, state, scope, error } = stravaCallback
    const connecting =
      error || !code || !state
        ? Promise.reject(new Error('Strava wasn’t connected, and nothing was shared with Taperday.'))
        : auth.getToken().then((token) => (token ? api.me.strava.connect(token, { code, state, scope }) : Promise.reject(new Error('Sign in again, then connect Strava.'))))
    connecting
      .finally(() => setStravaConnecting(false))
      .then(() => setStravaNotice('Strava is connected. Your runs from the last six weeks are on their way, and new ones arrive by themselves.'))
      .catch((failure: unknown) => setStravaNotice(failure instanceof Error ? failure.message : 'Connecting Strava didn’t work. Try again.'))
  }, [stravaCallback, runner.state.kind, auth])

  // Signed in with a plan: open on it, not on the builder. Once per visit, and never over a plan link they opened.
  const found = currentPlan.current
  useEffect(() => {
    if (landing.current || !found || initial || view !== 'build' || plan.kind !== 'idle' || editing) return
    landing.current = true
    const inputs = fromRequest(found.inputs)
    // After this render, not inside it: the plan view takes over from the "opening" placeholder.
    void Promise.resolve().then(() => {
      setLanded(true)
      if (!inputs) return
      setPlan({ kind: 'loading' })
      fetchPlan(inputs)
    })
  }, [found, initial, view, plan.kind, editing, fetchPlan])

  // A shared link builds its plan straight away.
  useEffect(() => {
    if (initial) fetchPlan(initial)
    return () => inflight.current?.abort()
  }, [initial, fetchPlan])

  const go = (next: View) => {
    // Going somewhere on purpose means the app no longer opens the current plan by itself.
    landing.current = true
    setLanded(true)
    setView(next)
    setOpenRun(null)
    // The build view keeps the plan link in the URL; the others get a plain view parameter.
    const query =
      next === 'plans' || next === 'runs' || next === 'account'
        ? `?view=${next}`
        : plan.kind === 'ready' || plan.kind === 'error'
          ? `?${toSearchParams(plan.inputs)}`
          : ''
    window.history.replaceState(null, '', query || window.location.pathname)
    window.scrollTo?.({ top: 0 })
  }

  const showRun = (id: string, uploaded?: Activity) => {
    setView('runs')
    setOpenRun({ id, uploaded })
    window.history.replaceState(null, '', `?view=runs&run=${encodeURIComponent(id)}`)
    window.scrollTo?.({ top: 0 })
  }

  const openSaved = (request: GeneratePlanRequest) => {
    const inputs = fromRequest(request)
    if (!inputs) return
    setView('build')
    // Remount the form so it shows the saved plan's choices, not whatever was typed before.
    setBuilderKey((k) => k + 1)
    setEditing(false)
    build(inputs)
  }

  const changeUnits = (next: Units) => {
    setUnits(next)
    saveUnits(next)
  }

  const state = runner.state
  const signedUp = (saved: Runner) => {
    setJustSignedUp(true)
    runner.setRunner(saved)
    if (prefersMotion()) setCelebrating(saved.displayName)
  }
  const builderInitial = plan.kind === 'ready' || plan.kind === 'error' ? plan.inputs : initial
  const showBuilder = view === 'build' && (editing || plan.kind === 'idle')
  const showPlan = view === 'build' && plan.kind === 'ready' && !editing
  // Signed in, on the builder with nothing open: wait to learn whether there's a plan to open instead.
  const opening = showBuilder && !editing && !initial && !landed && !justSignedUp && state.kind === 'ready' && currentPlan.current !== null

  // Signing up comes first: until the runner has an account, the wizard's first screen is the account step.
  const gate: Gate | undefined =
    state.kind === 'signed-out'
      ? {
          key: 'pitch',
          title: 'Your race, your week, your plan',
          hint: 'A free account keeps your plans with you, from the first easy run to the start line.',
          body: <SignUpPitch onSignUp={auth.signUp} onSignIn={auth.signIn} />,
        }
      : state.kind === 'needs-sign-up'
        ? {
            key: 'profile',
            title: 'A bit about you',
            hint: 'So your plans and emails fit you. Then on to your race.',
            body: <ProfileForm submitLabel="Continue" onSaved={signedUp} />,
          }
        : state.kind === 'error'
          ? {
              key: 'error',
              title: 'We couldn’t load your account',
              hint: state.message,
              body: (
                <div className="submit-row">
                  <button type="button" className="button" onClick={() => runner.refresh()}>
                    Try again
                  </button>
                  <button type="button" className="link-button" onClick={auth.signOut}>
                    Sign out
                  </button>
                </div>
              ),
            }
          : undefined

  return (
    <div className="page">
      {playIntro && <RaceStartIntro onDone={finishIntro} />}
      {celebrating !== null && <StartListCelebration name={celebrating} onDone={finishCelebrating} />}
      <header className="masthead">
        <button type="button" className="wordmark wordmark-button" onClick={() => go('build')}>
          {/* "taper" steps down letter by letter, like a taper; "day" comes back full size: race day. */}
          <span className="visually-hidden">Taperday</span>
          <span className="wordmark-letters" aria-hidden="true">
            <span className="wl wl-1">t</span>
            <span className="wl wl-2">a</span>
            <span className="wl wl-3">p</span>
            <span className="wl wl-4">e</span>
            <span className="wl wl-5">r</span>
            <span className="wordmark-accent">day</span>
          </span>
        </button>

        {state.kind !== 'off' && (
          <nav className="masthead-nav" aria-label="Account">
            {state.kind === 'signed-out' && (
              <button type="button" className="button button-quiet" onClick={auth.signIn}>
                Sign in
              </button>
            )}
            {/* Signed in but still waiting on the account: Sign out stays reachable, so a slow server never traps anyone. */}
            {(state.kind === 'ready' || state.kind === 'needs-sign-up' || state.kind === 'error' || (state.kind === 'loading' && auth.account !== null)) && (
              <>
                {state.kind === 'ready' && (
                  <>
                    <button type="button" className="nav-link" aria-current={view === 'plans' ? 'page' : undefined} onClick={() => go('plans')}>
                      My plans
                    </button>
                    <button type="button" className="nav-link" aria-current={view === 'runs' ? 'page' : undefined} onClick={() => go('runs')}>
                      My runs
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
        {auth.error && (
          <div className="callout" role="alert">
            <p>
              {auth.error.message}{' '}
              <button type="button" className="link-button" onClick={auth.signIn}>
                Try again
              </button>
            </p>
            {auth.error.code && <p className="field-help">Error code {auth.error.code}, if you contact us.</p>}
          </div>
        )}
        {state.kind === 'needs-sign-up' && view !== 'sign-up' && !showBuilder && (
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
        {state.kind === 'error' && !showBuilder && (
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
                signedUp(saved)
                go('build')
              }}
            />
          </section>
        )}

        {(view === 'plans' || view === 'runs' || view === 'account') && state.kind === 'loading' && (
          <SignInWait onRetry={runner.refresh} onSignOut={auth.signOut} />
        )}

        {view === 'plans' && state.kind === 'ready' && <MyPlans onOpen={openSaved} onBuildNew={() => go('build')} onChanged={currentPlan.refresh} />}

        {view === 'runs' &&
          state.kind === 'ready' &&
          (openRun ? (
            <ActivityPage
              key={openRun.id}
              id={openRun.id}
              initial={openRun.uploaded}
              units={units}
              onBack={() => go('runs')}
              onDeleted={() => go('runs')}
              onOpenAccount={() => go('account')}
            />
          ) : (
            <MyRuns units={units} onOpen={showRun} />
          ))}

        {view === 'account' && state.kind === 'ready' && (
          <AccountPage
            key={stravaNotice ?? 'account'}
            runner={state.runner}
            stravaNotice={stravaNotice}
            stravaConnecting={stravaConnecting}
            onSaved={runner.setRunner}
            onDeleted={() => {
              go('build')
              auth.signOut()
            }}
          />
        )}

        {(view === 'plans' || view === 'runs' || view === 'account') && (state.kind === 'signed-out' || state.kind === 'off') && (
          <div className="empty">
            <p>Sign in to see your saved plans, runs and account.</p>
            {state.kind === 'signed-out' && (
              <button type="button" className="button" onClick={auth.signIn} style={{ marginTop: 'var(--space-3)' }}>
                Sign in
              </button>
            )}
          </div>
        )}

        {(view === 'build' || view === 'sign-up') && (
          <>
            {/* Wait to hear who the runner is, so a returning runner never sees the sign-up screen flash past. */}
            {showBuilder && state.kind === 'loading' && <SignInWait onRetry={runner.refresh} onSignOut={auth.signOut} />}
            {showBuilder && state.kind !== 'loading' && opening && (
              // "Opening" only once a plan is known to exist; until then it's still the account being checked.
              <p className="loading-line">{currentPlan.current ? 'Opening your plan…' : 'Checking your account…'}</p>
            )}

            {showBuilder && state.kind !== 'loading' && !opening && (
              <BuilderForm
                key={builderKey}
                races={races}
                onRetryRaces={retryRaces}
                initial={builderInitial}
                units={units}
                busy={plan.kind === 'loading'}
                serverErrors={fieldErrors}
                today={today}
                onSubmit={buildFromWizard}
                onCancel={plan.kind === 'ready' ? backToPlan : undefined}
                gate={gate}
                intro={
                  <>
                    <Hero
                      races={races.kind === 'ready' ? races.races : []}
                      today={today}
                      units={units}
                      lede={
                        auth.enabled
                          ? 'A week-by-week running plan built around your race and the days you can run, with a pace and a reason for every session.'
                          : 'Five quick questions and you’ll have a week-by-week plan with a pace and a reason for every session. No account, no app, nothing to pay.'
                      }
                    />
                    <RaceTicker races={races.kind === 'ready' ? races.races : []} units={units} />
                  </>
                }
              />
            )}

            <div aria-live="polite" aria-busy={plan.kind === 'loading'}>
              {plan.kind === 'loading' &&
                (showBuilder ? <p className="visually-hidden">Building your plan…</p> : <p className="loading-line">Building your plan…</p>)}
              {plan.kind === 'error' && view === 'build' && (
                <div className="error-panel" style={{ marginTop: 'var(--space-7)' }} role="alert">
                  <strong>We couldn’t build that plan.</strong>
                  <p>{plan.message}</p>
                  <div className="submit-row" style={{ marginTop: 'var(--space-3)' }}>
                    <button type="button" className="button button-quiet" onClick={() => build(plan.inputs)}>
                      Try again
                    </button>
                    {/* The race may have gone from the calendar: never leave the runner without a way to build something. */}
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => {
                        setPlan({ kind: 'idle' })
                        setBuilderKey((k) => k + 1)
                        window.history.replaceState(null, '', window.location.pathname)
                      }}
                    >
                      Build a different plan
                    </button>
                  </div>
                </div>
              )}
            </div>

            {showPlan && (
              <PlanView
                key={`${plan.plan.race.name}|${plan.plan.race.date}|${plan.plan.startDate}`}
                plan={plan.plan}
                units={units}
                onUnitsChange={changeUnits}
                shareUrl={`${window.location.origin}${window.location.pathname}?${toSearchParams(plan.inputs)}`}
                calendar={calendarLinks(toRequest(plan.inputs), units, plan.plan.race.name, apiOrigin())}
                today={today}
                runs={state.kind === 'ready' ? runs : undefined}
                bests={state.kind === 'ready' ? synced.bests : undefined}
                strava={state.kind === 'ready' ? synced.strava : undefined}
                onOpenAccount={state.kind === 'ready' ? () => go('account') : undefined}
                onOpenRuns={state.kind === 'ready' ? () => go('runs') : undefined}
                onOpenRun={state.kind === 'ready' ? (id) => showRun(id) : undefined}
                toolbarExtra={
                  <>
                    <button type="button" className="button button-quiet" onClick={changeAnswers}>
                      Change answers
                    </button>
                    <SavePlanButton
                      key={toSearchParams(plan.inputs).toString()}
                      runner={state}
                      request={toRequest(plan.inputs)}
                      onOpenMyPlans={() => go('plans')}
                      onFinishSignUp={() => go('sign-up')}
                      autoSave={freshBuild}
                      current={currentPlan.current}
                      onSaved={currentPlan.refresh}
                    />
                  </>
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
