import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Home } from '../features/runner-home/Home'
import { ProfileForm } from '../features/account/ProfileForm'
import { ReplacePlanBar } from '../features/account/ReplacePlanBar'
import { SavePlanButton } from '../features/account/SavePlanButton'
import { PlanLocked } from '../features/account/PlanLocked'
import { SignUpPitch } from '../features/account/SignUpPitch'
import { StartListCelebration } from '../features/account/StartListCelebration'
import { useCalendarLink } from '../features/account/useCalendarLink'
import { currentTraining, samePlan, sameRace, useCurrentPlan } from '../features/account/useCurrentPlan'
import { useRunner } from '../features/account/useRunner'
import { PrivacyPolicy, PrivacyUpdate } from '../features/privacy/Privacy'
import { FeedbackBox } from '../features/account/FeedbackBox'
import { FindingPlan } from '../features/account/FindingPlan'
import { AccountRecovery } from '../features/account/AccountRecovery'
import { Unsubscribe } from '../features/account/Unsubscribe'
import { Wordmark } from './Wordmark'
import { PRIVACY_CONTACT } from '../features/privacy/privacy-notice'
import { useMediaQuery } from '../lib/use-media-query'
import { TabBar, type TabBarItem } from './TabBar'
import { Runner as TaperdayRunner } from '../features/shared/Runner'
import { RunnerLoading } from '../features/shared/RunnerLoading'
import { ThemeToggle } from './ThemeToggle'
import { ScreenRecovery } from './ScreenRecovery'
import { SignInWait } from '../features/account/SignInWait'
import { RemindersSection } from '../features/reminders/Reminders'
import { useCheckIns } from '../features/coaching/useCheckIns'
import { completionsKey, useSyncedCompletions } from '../features/coaching/useSyncedCompletions'
import { CheckInLoadState } from '../features/coaching/CheckInLoadState'
import { OfflineRunDrafts } from '../features/coaching/OfflineRunDrafts'
import { BuilderForm, type FieldErrors, type Gate, type RacesState } from '../features/builder/BuilderForm'
import { MOVIE_MS } from '../features/builder/plan-theatre'
import { withPlanBuildDeadline } from '../features/builder/plan-build'
import { Hero, RaceTicker } from '../features/home/Hero'
import { SignInLanding } from '../features/home/SignInLanding'
import { BrandIntroGate } from '../features/home/BrandIntroGate'
import { PlanView } from '../features/plan/PlanView'
import { isLiveRecovery, isPostTrainingHome } from '../features/journey/journey-model'
import { useJourney } from '../features/journey/useJourney'
import { useToday } from '../lib/useToday'
import { readStravaCallback, STRAVA_CALLBACK_PATH } from '../features/sync/strava-callback'
import { StravaWelcome } from '../features/sync/StravaWelcome'
import { beginStravaWelcome, finishStravaWelcome, hasStravaWelcome } from '../features/sync/strava-welcome'
import { useSyncedRuns } from '../features/sync/useSyncedRuns'
import { api, ApiError, apiOrigin } from '../lib/api-client'
import { calendarLinks, personalCalendarLinks } from '../lib/calendar-links'
import { ownerOf, readSnapshot, saveSnapshot, type HomeSnapshot } from '../lib/home-snapshot'
import { localToday, parseTimeSpan, type Units } from '../lib/format'
import { fromRequest, fromSearchParams, toRequest, toSearchParams, type PlanInputs, type ReplanInputs } from '../lib/plan-url'
import { prefersMotion, type IntroAudience } from '../lib/motion'
import type { Activity, CoachNote, GeneratePlanRequest, Runner, TrainingPlan } from '../lib/types'
import { useAuth } from './auth-context'

const AccountPage = lazy(() => import('../features/account/AccountPage').then((module) => ({ default: module.AccountPage })))
const ActivityPage = lazy(() => import('../features/activities/ActivityPage').then((module) => ({ default: module.ActivityPage })))
const MyRuns = lazy(() => import('../features/activities/MyRuns').then((module) => ({ default: module.MyRuns })))
const JourneyPage = lazy(() => import('../features/journey/JourneyPage').then((module) => ({ default: module.JourneyPage })))
const RecoveryPlanPage = lazy(() => import('../features/journey/RecoveryPlanPage').then((module) => ({ default: module.RecoveryPlanPage })))
const CouchTo5K = lazy(() => import('../features/beginner/CouchTo5K').then((module) => ({ default: module.CouchTo5K })))

type PlanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; plan: TrainingPlan; inputs: PlanInputs }
  | { kind: 'error'; message: string; inputs: PlanInputs }

type View = 'home' | 'build' | 'beginner' | 'runs' | 'journey' | 'recovery' | 'account' | 'onboarding' | 'privacy' | 'sign-up' | 'sign-in' | 'unsubscribe'

const routeSearch = () => window.location.search
const subscribeRoute = (notify: () => void) => {
  window.addEventListener('popstate', notify)
  return () => window.removeEventListener('popstate', notify)
}

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
  StartOn: 'startOn',
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

/**
 * The old Running insights / Running tools page is gone: totals live on Runs and the calculators sit at its foot, so those
 * links (including the ones opened from Runs) land on Runs, with the calculators open for a tools link.
 */
function redirectRunningDetails() {
  const params = new URLSearchParams(window.location.search)
  const tab = params.get('tab')
  if (params.get('view') !== 'home' || (tab !== 'insights' && tab !== 'tools')) return
  window.history.replaceState(window.history.state, '', tab === 'tools' ? '?view=runs&tab=tools' : '?view=runs')
}

const viewFromUrl = (): View => {
  if (window.location.pathname === STRAVA_CALLBACK_PATH) return 'account'
  redirectRunningDetails()
  const view = new URLSearchParams(window.location.search).get('view')
  // Old saved-plan links now open the permanent journey, including when there is no current plan.
  if (view === 'plans') return 'journey'
  return view === 'home' || view === 'beginner' || view === 'runs' || view === 'journey' || view === 'recovery' || view === 'account' || view === 'onboarding' || view === 'privacy' || view === 'unsubscribe' || view === 'sign-in' ? view : 'build'
}

/** Wait for the full five-scene story without delaying reduced-motion users.
 * The timer begins on submission, in parallel with the API and any plan saving.
 * Aborting navigation cancels the wait immediately. */
function finishBuildMovie(signal: AbortSignal): Promise<void> {
  if (!prefersMotion() || signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    let completed = false
    const finish = () => {
      if (completed) return
      completed = true
      window.clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = window.setTimeout(finish, MOVIE_MS)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export function App() {
  const locationSearch = useSyncExternalStore(subscribeRoute, routeSearch)
  const auth = useAuth()
  const owner = auth.account ? ownerOf(auth.account) : null
  const runner = useRunner()
  const today = useToday(runner.state.kind === 'ready' ? runner.state.runner.timeZone : undefined)
  // The plan link the page was opened with. Starting afresh forgets it, so a blank builder is really blank.
  const [initial, setInitial] = useState(() => {
    const query = new URLSearchParams(window.location.search)
    const draft = query.has('editingPlan') ? query.get('editDraft') : null
    return (draft ? fromSearchParams(new URLSearchParams(draft)) : null) ?? fromSearchParams(query)
  })
  // An interrupted edit restores its answers for review, never an automatic save on reload.
  const [restoredEdit] = useState(() => {
    const query = new URLSearchParams(window.location.search)
    return initial && query.has('editDraft') ? query.get('editingPlan') : null
  })
  const [restoredEditOwner] = useState(() => {
    const proof = window.history.state?.taperdayPlanEdit as { id?: unknown; owner?: unknown; draft?: unknown } | undefined
    return restoredEdit && proof && proof.id === restoredEdit && typeof proof.owner === 'string'
      && proof.draft === new URLSearchParams(window.location.search).get('editDraft') ? proof.owner : null
  })
  const [view, setView] = useState<View>(viewFromUrl)
  const [preparationRequest, setPreparationRequest] = useState<{ mode: 'long' | 'race'; date: string | null } | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('prepare')
    return mode === 'long' || mode === 'race' ? { mode, date: params.get('date') } : null
  })
  const phone = useMediaQuery('(max-width: 47.99rem)')
  // Phones and tablets get the app's navigation as a bar along the bottom, as an installed app's; desktops get it as a
  // rail down the left. Same five places, same order.
  const compact = useMediaQuery('(max-width: 63.99rem)')
  // Bumped when a run is deleted, so the journal beside it on a desktop loads again.
  const [runsVersion, setRunsVersion] = useState(0)
  // Keep Add runs open when the Runs panel moves between mobile and desktop layouts.
  const [addRunsOpen, setAddRunsOpen] = useState(false)
  // Plan navigation can return to the current week from any training detail.
  // The runner's own picture, if they added one; initials show until it arrives, or without one.
  const [photo, setPhoto] = useState<string | null>(null)
  // Moving to another page fades its content in. The page you load on is left alone: there's nothing to move from, and
  // the intro has its own entrance.
  const [shownView, setShownView] = useState(view)
  const [navigated, setNavigated] = useState(false)
  if (view !== shownView) {
    setShownView(view)
    setNavigated(true)
  }
  const [openRun, setOpenRun] = useState<OpenRun | null>(runFromUrl)
  // Bumped when Plan is tapped on Couch to 5K, which brings it back to This week.
  const [beginnerWeek, setBeginnerWeek] = useState(0)
  // Strava's answer when the runner comes back from connecting, read once and handled when they're signed in.
  const [stravaCallback] = useState(() => readStravaCallback(window.location))
  const stravaHandled = useRef(false)
  const [stravaNotice, setStravaNotice] = useState<string | null>(null)
  // True from the moment Strava sends the runner back until the connection is saved, so Account says so meanwhile.
  const [stravaConnecting, setStravaConnecting] = useState(() => stravaCallback !== null && !stravaCallback.error && !!stravaCallback.code)
  const [races, setRaces] = useState<RacesState>({ kind: 'loading' })
  // A shared link starts building straight away, so it opens in the loading state.
  const [plan, setPlan] = useState<PlanState>(() => (initial && !restoredEdit ? { kind: 'loading' } : { kind: 'idle' }))
  const [fromCopy, setFromCopy] = useState<{ plan: TrainingPlan } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [builderKey, setBuilderKey] = useState(0)
  // True while the wizard is open over a plan (or about to produce one). A built plan replaces the wizard.
  const [editing, setEditing] = useState(!!restoredEdit)
  // A plan that has just arrived from the API reveals its parts in turn; one opened from the device's copy is simply there.
  const [revealPlan, setRevealPlan] = useState(false)
  const [freshBuild, setFreshBuild] = useState(false)
  // A landing visitor and a returning signed-in runner get the brand story on their first entry.
  // Who just made the start list, while their celebration plays.
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const finishCelebrating = useCallback(() => setCelebrating(null), [])
  const inflight = useRef<AbortController | null>(null)
  const editingSavedPlan = useRef<string | null>(restoredEdit)
  const editingSavedOwner = useRef<string | null>(restoredEditOwner)
  useEffect(() => () => inflight.current?.abort(), [auth.account?.id, auth.account?.email, auth.account?.name])

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
  const fetchPlan = useCallback((inputs: PlanInputs, beforeShow?: (request: ReturnType<typeof toRequest>, signal: AbortSignal) => Promise<void>, playMovie = false) => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller

    const withDate = { ...inputs, planFrom: inputs.planFrom ?? localToday() }
    const query = toSearchParams(withDate)
    const navigation = new URLSearchParams(window.location.search)
    for (const key of ['day', 'planTab', 'planWeek', 'month', 'progressWeeks', 'review']) {
      const value = navigation.get(key)
      if (value) query.set(key, value)
    }
    // Canonical plan fields remain the saved version until the write succeeds. The draft is a separate review-only link.
    const pendingQuery = new URLSearchParams(beforeShow ? window.location.search : query)
    const pendingState = { ...window.history.state }
    delete pendingState.taperdayPlanEdit
    if (beforeShow && editingSavedPlan.current && owner) {
      pendingQuery.set('editingPlan', editingSavedPlan.current)
      pendingQuery.set('editDraft', query.toString())
      // A pasted or altered URL can restore answers, but only this account's original tab can resume its edit.
      pendingState.taperdayPlanEdit = { id: editingSavedPlan.current, owner, draft: query.toString() }
    }
    window.history.replaceState(pendingState, '', `?${pendingQuery}`)

    const stored = owner && !beforeShow ? readSnapshot(owner) : null
    const cached = stored?.current && stored.plan?.id === stored.current.id && samePlan(toRequest(withDate), stored.current.inputs)
      ? stored.plan.plan : null
    const showCached = () => {
      if (!cached || controller.signal.aborted) return
      setFromCopy({ plan: cached })
      setPlan({ kind: 'ready', plan: cached, inputs: withDate })
      setRevealPlan(false)
      setEditing(false)
    }
    // A reload of the runner's own plan link must retain the cached account identity and offline logging controls.
    // The same holds online: this is the runner's own plan as Home's coach read last left it on this device, so it shows
    // at once and the coach read below brings it up to date in one request. Regenerating it first only added a round trip.
    if (cached && !playMovie) { queueMicrotask(() => { showCached(); if (inflight.current === controller) inflight.current = null }); return }

    withPlanBuildDeadline(controller.signal, async signal => {
      // The original story and real work run together, with one bounded, cancellable handoff.
      const movie = playMovie ? finishBuildMovie(signal) : Promise.resolve()
      const result = await api.plan(toRequest(withDate), signal)
      signal.throwIfAborted()
      await Promise.all([movie, beforeShow?.(toRequest(withDate), signal)])
      signal.throwIfAborted()
      return result
    }).then((result) => {
        if (controller.signal.aborted) return
        const settledState = { ...window.history.state }
        delete settledState.taperdayPlanEdit
        window.history.replaceState(settledState, '', `?${query}`)
        setPlan({ kind: 'ready', plan: result, inputs: withDate })
        setRevealPlan(true)
        setEditing(false)
        window.scrollTo?.({ top: 0 })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (cached && error instanceof ApiError && [0, 502, 503, 504].includes(error.status)) { showCached(); return }
        if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
          setFieldErrors(toFieldErrors(error.fieldErrors))
          setPlan({ kind: 'idle' })
          document.querySelector('.builder')?.scrollIntoView?.({ block: 'start' })
          return
        }
        setPlan({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.', inputs: withDate })
      })
      .finally(() => { if (inflight.current === controller) inflight.current = null })
  }, [owner])

  const build = (inputs: PlanInputs, playMovie = false) => {
    setFieldErrors({})
    setPlan({ kind: 'loading' })
    fetchPlan(inputs, undefined, playMovie)
  }

  const buildFromWizard = (inputs: PlanInputs) => {
    if (inflight.current) return
    const own = currentPlan.current
    if (editing && own && owner && editingSavedOwner.current === owner && own.id === editingSavedPlan.current && sameRace(toRequest(inputs), own.inputs)) {
      setFieldErrors({})
      setPlan({ kind: 'loading' })
      fetchPlan(inputs, async (request, signal) => {
        const token = await auth.getToken()
        signal.throwIfAborted()
        if (!token) throw new ApiError('Sign in again to save your updated plan.', 401)
        const saved = await api.me.savePlan(token, request, own.name, true, own.id, signal)
        if (signal.aborted) return
        currentPlan.remember({ id: saved.id, name: saved.name, inputs: request })
        editingSavedPlan.current = null
        editingSavedOwner.current = null
      }, true)
      return
    }
    setFreshBuild(plan.kind !== 'ready')
    setEditing(true)
    build(inputs, true)
  }

  const changeAnswers = () => {
    editingSavedPlan.current = savedOnScreen
    editingSavedOwner.current = owner
    // Remount so the wizard starts from this plan's answers, on its summary screen.
    setBuilderKey((k) => k + 1)
    setEditing(true)
    window.scrollTo?.({ top: 0 })
  }

  const backToPlan = () => {
    editingSavedPlan.current = null
    editingSavedOwner.current = null
    setEditing(false)
    window.scrollTo?.({ top: 0 })
  }

  // The runner's runs (uploaded and synced), bests and Strava status, shown inside the plan. Loaded when the plan
  // view opens, so a new upload or a run that just arrived from Strava appears.
  const synced = useSyncedRuns(runner.state.kind === 'ready' && (view === 'build' || view === 'home'))
  const currentPlan = useCurrentPlan(runner.state.kind === 'ready', today)
  const journey = useJourney(runner.state.kind === 'ready')
  const recovery = journey.state.kind === 'ready' ? journey.state.journey.recovery : null
  const recovering = isLiveRecovery(recovery)
  const maintaining = journey.state.kind === 'ready' && journey.state.journey.maintenance?.status === 'Active'
  const landing = useRef(false)
  const [landed, setLanded] = useState(false)
  // Someone who has just signed up has no plan to open, so the builder never waits for one.
  const [justSignedUp, setJustSignedUp] = useState(false)
  const runs = synced.runs

  // The runner's last-seen Home, kept on this device, so it shows at once while the account refreshes. Read once per
  // account; each piece is replaced as this visit's answer arrives, and saved again for next time.
  const [snapshot, setSnapshot] = useState<{ owner: string; copy: HomeSnapshot | null } | null>(null)
  if (owner && snapshot?.owner !== owner) setSnapshot({ owner, copy: readSnapshot(owner) })
  const copy = owner && snapshot?.owner === owner ? snapshot.copy : null
  const ready = runner.state.kind === 'ready' ? runner.state.runner : null
  // Units are an account setting (Account › profile). Signed out, or before the account loads, kilometres.
  const profileUnits = ready?.units ?? copy?.runner?.units
  const units: Units = profileUnits === 'Miles' ? 'mi' : 'km'
  useEffect(() => {
    if (owner && ready) saveSnapshot(owner, { runner: ready })
  }, [owner, ready])
  const loadedPlan = currentPlan.current
  useEffect(() => {
    if (owner && ready && loadedPlan !== undefined) saveSnapshot(owner, { current: loadedPlan })
  }, [owner, ready, loadedPlan])
  useEffect(() => {
    if (owner && ready && synced.runs) saveSnapshot(owner, { runs: synced.runs })
  }, [owner, ready, synced.runs])
  useEffect(() => {
    if (owner && ready && synced.bests) saveSnapshot(owner, { bests: synced.bests })
  }, [owner, ready, synced.bests])
  useEffect(() => {
    if (owner && ready && synced.strava) saveSnapshot(owner, { strava: synced.strava })
  }, [owner, ready, synced.strava])
  const savePlan = useCallback((plan: { id: string; plan: TrainingPlan }) => owner && saveSnapshot(owner, { plan }), [owner])

  // Check-ins live on the runner's saved plan, so they're offered only when that's the plan on screen.
  const copiedCurrent = copy?.current && copy.plan?.id === copy.current.id && copy.plan.plan.race.date < today ? null : copy?.current
  const ownPlan = currentTraining(currentPlan.current !== undefined ? currentPlan.current : (copiedCurrent ?? undefined), today)
  const savedOnScreen =
    plan.kind === 'ready' && ownPlan && samePlan(toRequest(plan.inputs), ownPlan.inputs) ? ownPlan.id : null
  const checkIns = useCheckIns(savedOnScreen)
  // Sessions a held Strava run completes on that plan: computed by the API on each read, never stored.
  const stravaCompletions = useSyncedCompletions(savedOnScreen, completionsKey(checkIns.entries, runs ?? []))
  // On the runner's own plan, the calendar menu subscribes to their personal feed, which follows every change to it.
  const calendarLink = useCalendarLink(owner, savedOnScreen !== null)

  // The runner's plan from the copy on this device, opened at once on a return visit while the account loads. It gives
  // way to this visit's plan as soon as that's on screen.

  // The runner's own plan opens with accepted coaching calls; opening it never accepts a new suggestion. Its note
  // shows on "This week". A plan from a link, or anyone else's, is the plan as written.
  const [coachNotes, setCoachNotes] = useState<{ planId: string; notes: CoachNote[] } | null>(null)
  const coachRequested = useRef<TrainingPlan | null>(null)
  const shownPlan = plan.kind === 'ready' ? plan.plan : null
  useEffect(() => {
    if (!savedOnScreen || !shownPlan || coachRequested.current === shownPlan) return
    coachRequested.current = shownPlan
    auth
      .getToken()
      .then((token) => (token ? api.me.coachPlan(token, savedOnScreen) : null))
      .then((coached) => {
        if (!coached) return
        // Marked before it's shown, so the coached plan isn't sent to the coach again.
        coachRequested.current = coached.plan
        setPlan((current) => (current.kind === 'ready' && current.plan === shownPlan ? { ...current, plan: coached.plan } : current))
        setCoachNotes({ planId: savedOnScreen, notes: coached.coaching ?? [] })
        // Kept on this device too, so next time the plan opens as it is now.
        savePlan({ id: savedOnScreen, plan: coached.plan })
      })
      // Without the coach, the plan on screen is the plan as written: nothing the runner needs is lost. A plan from the
      // copy on this device stays usable.
      .catch(() => setFromCopy((copied) => (copied?.plan === shownPlan ? null : copied)))
  }, [savedOnScreen, shownPlan, auth, savePlan])
  const notes = coachNotes && coachNotes.planId === savedOnScreen ? coachNotes.notes : undefined

  // Back from Strava: finish connecting, then resume onboarding if this was a new signup.
  const stravaRunnerId = runner.state.kind === 'ready' ? runner.state.runner.id : null
  useEffect(() => {
    if (!stravaCallback || stravaHandled.current || !stravaRunnerId) return
    stravaHandled.current = true
    const welcome = hasStravaWelcome(stravaRunnerId)
    window.history.replaceState(null, '', welcome ? '/?view=onboarding' : '/?view=account')
    if (welcome) setView('onboarding')
    const { code, state, scope, error } = stravaCallback
    const connecting =
      error || !code || !state
        ? Promise.reject(new Error('Strava wasn’t connected, and nothing was shared with Taperday.'))
        : auth.getToken().then((token) => (token ? api.me.strava.connect(token, { code, state, scope }) : Promise.reject(new Error('Sign in again, then connect Strava.'))))
    connecting
      .finally(() => setStravaConnecting(false))
      .then(() => setStravaNotice('Strava is connected. Your runs from the last six weeks are on their way, and new ones arrive by themselves.'))
      .catch((failure: unknown) => setStravaNotice(failure instanceof Error ? failure.message : 'Connecting Strava didn’t work. Try again.'))
  }, [stravaCallback, stravaRunnerId, auth])

  // Signed in with a plan: open inside it, not on the builder or Home. From the plan this device kept when there is one,
  // straight away; otherwise built afresh from its answers, which needs only the API, never the sleeping database. Signed
  // in without a plan: Home, which offers one. Once per visit, and never over a plan link they opened.
  // The plan this visit found, or until then the one last seen on this device, so the plan opens without waiting.
  const found = ownPlan
  // A runner this device already knows opens from the copy too, plan or no plan, so the waiting film only plays when
  // there's nothing to show yet: a first sign-in here, or a brand new account.
  const knownHere = copy?.runner !== undefined
  const latestPlan = currentPlan.current
  // A completed chapter still has a Home on a new device, without relying on a cached profile.
  const returningAfterPlan = latestPlan === null && journey.state.kind === 'ready' && isPostTrainingHome(journey.state.journey, null, today)
  // Completing Microsoft sign-in must not strand returning runners on the sign-in URL.
  // Wait for the saved-plan lookup; only then decide between their plan and Home.
  useEffect(() => {
    if (view !== 'sign-in' || runner.state.kind !== 'ready' || latestPlan === undefined && !currentPlan.failed) return
    if (latestPlan) {
      landing.current = false
      setLanded(true)
      setView('build')
      window.history.replaceState(null, '', window.location.pathname)
    } else {
      setView('home')
      window.history.replaceState(null, '', '?view=home')
    }
  }, [view, runner.state.kind, latestPlan, currentPlan.failed])
  useEffect(() => {
    if (landing.current || !(found || knownHere || returningAfterPlan || currentPlan.failed) || initial || view !== 'build' || plan.kind !== 'idle' || editing) return
    landing.current = true
    // A runner coming back with their plan kept on this device opens straight on it, as opening it from Home would show
    // it, while the account loads. Only before this visit has found their plan: after that, Home opens it for real.
    const copied =
      latestPlan === undefined && found && copy?.current && copy.plan?.id === copy.current.id
        ? { inputs: fromRequest(copy.current.inputs), plan: copy.plan.plan }
        : null
    const own = found ? fromRequest(found.inputs) : null
    // After this render, not inside it: the plan (or Home) takes over from the page shown while the account answered.
    void Promise.resolve().then(() => {
      setLanded(true)
      if (copied?.inputs) {
        const inputs = copied.inputs
        setFromCopy({ plan: copied.plan })
        setBuilderKey((k) => k + 1)
        setPlan({ kind: 'ready', plan: copied.plan, inputs })
        setRevealPlan(false)
        window.history.replaceState(null, '', `?${toSearchParams(inputs)}`)
        return
      }
      if (own) {
        // No copy of the plan here (a first sign-in on this device, say): build it from its answers, as Home's "Open your
        // plan" would. Home stays a tap away.
        setBuilderKey((k) => k + 1)
        build(own)
        return
      }
      setView('home')
      window.history.replaceState(null, '', '?view=home')
    })
    // build is a fresh function each render; what it does doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, knownHere, returningAfterPlan, initial, view, plan.kind, editing, copy, latestPlan, currentPlan.failed])

  // Once the account says which plan is current, the copy gives way to it, as opening the plan from Home would: the same
  // plan is brought up to date by the coach (above), a plan changed on another device is built afresh, and a plan deleted
  // elsewhere sends the runner Home, which offers a new one. Anything else on screen is left alone.
  const copyChecked = useRef<TrainingPlan | null>(null)
  useEffect(() => {
    const showingCopy = fromCopy && view === 'build' && plan.kind === 'ready' && plan.plan === fromCopy.plan
    if (!showingCopy || latestPlan === undefined || copyChecked.current === fromCopy.plan) return
    copyChecked.current = fromCopy.plan
    if (latestPlan === null) {
      void Promise.resolve().then(() => {
        setPlan({ kind: 'idle' })
        setView('home')
        window.history.replaceState(null, '', '?view=home')
      })
    } else if (!samePlan(toRequest(plan.inputs), latestPlan.inputs)) {
      // The saved copy stays on screen until the refreshed plan arrives.
      const inputs = fromRequest(latestPlan.inputs)
      if (inputs) fetchPlan(inputs)
    }
  }, [fromCopy, latestPlan, view, plan, fetchPlan])
  useEffect(() => {
    if ((plan.kind !== 'ready' && plan.kind !== 'error') || !plan.inputs.raceSlug || plan.inputs.raceSnapshot
      || ownPlan?.inputs.raceSlug !== plan.inputs.raceSlug) return
    const snapshot = fromRequest(ownPlan.inputs)?.raceSnapshot
    if (!snapshot) return
    const inputs = plan.inputs
    if (plan.kind === 'ready') {
      queueMicrotask(() => setPlan(current => current.kind === 'ready' && current.inputs === inputs
        ? { ...current, inputs: { ...inputs, raceSnapshot: snapshot } } : current))
    } else if (!editingSavedPlan.current) {
      // An older short link can recover its known race metadata from the runner's authenticated saved plan.
      fetchPlan({ ...inputs, raceSnapshot: snapshot })
    }
  }, [plan, ownPlan, fetchPlan])
  // A shared link builds its plan straight away.
  useEffect(() => {
    if (initial && !restoredEdit) fetchPlan(initial)
    return () => inflight.current?.abort()
  }, [initial, restoredEdit, fetchPlan])

  // Moving to another page adds a history entry, so the browser's Back button comes back here instead of leaving
  // Taperday. Changes within a page (a plan's link as it's rebuilt) replace the entry.
  const moveTo = (query: string, toAnotherPage: boolean) => {
    const url = query || window.location.pathname
    if (toAnotherPage) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }

  // Plan opens the runner's current week, or the builder when they have no plan. Journey has its own destination.
  // A plan from a link (signed out) works the same way.
  const pickFromBar = (item: TabBarItem) => {
    if (item === 'home') return go('home')
    if (item === 'runs') return go('runs')
    if (item === 'journey') return go('journey')
    if (item === 'account') return go('account')
    // Couch to 5K is a plan of its own: Plan stays lit on it, and tapping Plan there opens the runner's race plan if they
    // have one, or else brings Couch to 5K back to This week, as it does on a race plan.
    if (view === 'beginner') {
      if (ownPlan) return openOwnPlan('week')
      setBeginnerWeek(n => n + 1)
      window.scrollTo?.({ top: 0 })
      return
    }
    if (!ownPlan && (recovering || maintaining) && !(view === 'build' && plan.kind === 'ready' && plan.plan.race.date >= today && !editing)) return go('recovery')
    const tab = 'week'
    if (view === 'build' && plan.kind === 'ready' && !editing) {
      const url = new URL(window.location.href)
      url.searchParams.set('planTab', tab)
      url.searchParams.delete('day')
      window.history.replaceState(window.history.state, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.scrollTo?.({ top: 0 })
      return
    }
    if (ownPlan) return openOwnPlan(tab)
    if (plan.kind === 'ready' && state.kind !== 'ready') {
      // Signed out with a plan from a link: back to it, on the asked-for tab.
      const query = new URLSearchParams(toSearchParams(plan.inputs))
      query.set('planTab', tab)
      setView('build')
      setOpenRun(null)
      moveTo(`?${query}`, true)
      window.scrollTo?.({ top: 0 })
      return
    }
    go('build')
  }

  const go = (next: View) => {
    if (next !== 'build') inflight.current?.abort()
    setPreparationRequest(null)
    // Going somewhere on purpose means the app no longer opens the current plan by itself.
    landing.current = true
    setLanded(true)
    setView(next)
    setOpenRun(null)
    // The build view keeps the plan link in the URL; the others get a plain view parameter.
    const query =
      next === 'home' || next === 'beginner' || next === 'runs' || next === 'journey' || next === 'recovery' || next === 'account' || next === 'onboarding' || next === 'privacy' || next === 'sign-in'
        ? `?view=${next}`
        : plan.kind === 'ready' || plan.kind === 'error'
          ? `?${toSearchParams(plan.inputs)}`
          : ''
    moveTo(query, next !== view || openRun !== null)
    // Legacy detail URLs share Home's view; notify their controls when Home itself is selected again.
    if (next === 'home' && view === 'home') window.dispatchEvent(new PopStateEvent('popstate'))
    window.scrollTo?.({ top: 0 })
  }

  const showRun = (id: string, uploaded?: Activity) => {
    setView('runs')
    setOpenRun({ id, uploaded })
    const origin = view === 'runs' && openRun ? new URLSearchParams(window.location.search).get('returnTo') ?? '?view=runs' : window.location.search || '?view=home'
    moveTo(`?view=runs&run=${encodeURIComponent(id)}${origin ? `&returnTo=${encodeURIComponent(origin)}` : ''}`, true)
    window.scrollTo?.({ top: 0 })
  }

  const returnFromRun = () => {
    const origin = new URLSearchParams(window.location.search).get('returnTo')
    const destination = origin?.startsWith('?') ? new URLSearchParams(origin).get('view') : null
    if (origin && (destination === 'home' || destination === 'journey' || destination === 'runs' || !destination)) {
      go(destination === 'home' ? 'home' : destination === 'journey' ? 'journey' : destination === 'runs' ? 'runs' : 'build')
      window.history.replaceState(null, '', origin)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } else go('runs')
  }
  const openRecovery = (raceId?: string) => {
    go('recovery')
    if (raceId) window.history.replaceState(null, '', `?view=recovery&race=${encodeURIComponent(raceId)}`)
  }
  const openRaces = () => {
    go('journey')
    window.history.replaceState(null, '', '?view=journey&section=races')
  }
  const openChapter = (planId?: string) => {
    go('journey')
    if (planId) window.history.replaceState(null, '', `?view=journey&section=training&chapter=${encodeURIComponent(planId)}`)
  }

  const openOwnDay = (date: string) => {
    if (!ownPlan) return
    const query = new URLSearchParams(window.location.search)
    query.set('planTab', 'week')
    query.set('day', date)
    window.history.pushState({ taperdayDay: true }, '', `?${query}`)
    openSaved(ownPlan.inputs)
  }

  // Nothing loaded, nothing half-typed, no link remembered, so a plan that's gone (or another one) never comes back by itself.
  const clearPlan = () => {
    inflight.current?.abort()
    landing.current = true
    setLanded(true)
    setInitial(null)
    setPlan({ kind: 'idle' })
    setFieldErrors({})
    setEditing(false)
    setBuilderKey((k) => k + 1)
  }

  // A blank builder, whenever the runner asks to build a new plan.
  const startFresh = () => {
    clearPlan()
    setView('build')
    setOpenRun(null)
    moveTo('', true)
    window.scrollTo?.({ top: 0 })
  }

  // Home, from the Taperday wordmark: the runner's Home when they're signed in (or, while the account loads, the Home kept
  // on this device), and never a half-edited form. Signed out, the builder (or the plan from their link, which lives only
  // in that link) is home.
  const goHome = () => {
    setEditing(false)
    go(runner.state.kind === 'ready' || (runner.state.kind === 'loading' && copy?.runner) ? 'home' : 'build')
  }

  // The runner's own plan, from Home. Back comes back to Home.
  const openOwnPlan = (tab: 'week' | 'all' | 'progress' = 'week') => {
    const own = ownPlan
    if (!own) return
    const query = new URLSearchParams(window.location.search)
    query.delete('day')
    query.set('planTab', tab)
    moveTo(`?${query}`, true)
    openSaved(own.inputs)
    window.scrollTo?.({ top: 0 })
  }

  // The runner deleted their plan from the plan itself: it's gone, so they go Home, which offers a new one.
  const planDeleted = () => {
    clearPlan()
    go('home')
  }

  // The browser's Back and Forward: show the page the URL names. A plan link builds its plan unless it's already on screen.
  const shownQuery = useRef<string | null>(null)
  useEffect(() => {
    shownQuery.current = plan.kind === 'ready' || plan.kind === 'error' ? toSearchParams(plan.inputs).toString() : null
  }, [plan])
  useEffect(() => {
    const onPop = () => {
      landing.current = true
      setLanded(true)
      setEditing(false)
      const next = viewFromUrl()
      if (next !== 'build') inflight.current?.abort()
      setView(next)
      setOpenRun(runFromUrl())
      const linked = next === 'build' ? fromSearchParams(new URLSearchParams(window.location.search)) : null
      if (linked && toSearchParams(linked).toString() !== shownQuery.current) {
        setFieldErrors({})
        setPlan({ kind: 'loading' })
        fetchPlan(linked)
      } else if (!linked && next === 'build') {
        inflight.current?.abort()
        setPlan({ kind: 'idle' })
      }
      window.scrollTo?.({ top: 0 })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [fetchPlan])

  const openSaved = (request: GeneratePlanRequest) => {
    const inputs = fromRequest(request)
    if (!inputs) return
    landing.current = true
    setLanded(true)
    setView('build')
    // Remount the form so it shows the saved plan's choices, not whatever was typed before.
    setBuilderKey((k) => k + 1)
    setEditing(false)
    build(inputs)
  }

  // The weekly review lives in Plan › Progress. Its reminder link (?view=home&review=1) still lands there, replacing the
  // old Home entry so Back doesn't bounce through it.
  const reviewLink = view === 'home' && new URLSearchParams(locationSearch).get('review') === '1' ? ownPlan?.inputs : undefined
  useEffect(() => {
    if (!reviewLink) return
    window.history.replaceState(null, '', '?planTab=progress&review=1')
    openSaved(reviewLink)
    // openSaved is a plain function of this render; the link itself is what should trigger the move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewLink])

  // "Replan from here". A shared plan is rebuilt from its link alone; the runner's saved plan is rebuilt in their account
  // too, so it opens rebuilt on every device. Failures go back to the replan form, never to the builder.
  const replanWith = async (replan: ReplanInputs | undefined) => {
    if (plan.kind !== 'ready') return
    const next: PlanInputs = { ...plan.inputs, replan }
    const saved = currentPlan.current
    const token = saved && samePlan(toRequest(plan.inputs), saved.inputs) ? await auth.getToken() : null
    const savedResult =
      saved && token
        ? replan
          ? await api.me.replanPlan(token, saved.id, { replanFrom: replan.from, setback: replan.setback, recentWeeklyKm: replan.recentWeeklyKm ?? null })
          : await api.me.undoReplan(token, saved.id)
        : null
    const rebuilt = savedResult ? savedResult.plan : await api.plan(toRequest(next))
    window.history.replaceState(null, '', `?${toSearchParams(next)}`)
    if (savedResult && saved) {
      // The saved plan comes back coached already.
      coachRequested.current = rebuilt
      setCoachNotes({ planId: saved.id, notes: savedResult.coaching ?? [] })
    }
    setPlan({ kind: 'ready', plan: rebuilt, inputs: next })
    if (saved && token) currentPlan.refresh()
    window.scrollTo?.({ top: 0 })
  }

  const state = runner.state
  // The runner's picture, once per account: nothing to fetch until they're known, and initials until it arrives.
  const readyId = state.kind === 'ready' ? state.runner.id : null
  useEffect(() => {
    if (!readyId) return
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.photo(token) : undefined))
      .then((found) => {
        if (!cancelled) setPhoto(found?.dataUrl ?? null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [readyId, auth])
  // Home shows for a registered runner, or, while the account is still loading, from the copy kept on this device.
  const homeRunner = state.kind === 'ready' ? state.runner : state.kind === 'loading' ? (copy?.runner ?? null) : null
  const signedUp = (saved: Runner) => {
    beginStravaWelcome(saved.id, window.location.search)
    setJustSignedUp(true)
    runner.setRunner(saved)
    landing.current = true
    setView('onboarding')
    window.history.replaceState(null, '', '?view=onboarding')
    if (prefersMotion()) setCelebrating(saved.displayName)
  }
  const leaveStravaWelcome = () => {
    if (state.kind !== 'ready') return
    const search = finishStravaWelcome(state.runner.id)
    landing.current = true
    setLanded(true)
    setView('build')
    const linked = fromSearchParams(new URLSearchParams(search))
    if (linked && plan.kind !== 'ready') {
      setPlan({ kind: 'loading' })
      fetchPlan(linked)
    } else if (plan.kind === 'ready') {
      window.history.replaceState(null, '', `?${toSearchParams(plan.inputs)}`)
    } else {
      setPlan({ kind: 'idle' })
      window.history.replaceState(null, '', '/')
    }
    window.scrollTo?.({ top: 0 })
  }
  const openStravaConnections = () => {
    go('account')
    window.history.replaceState(null, '', '?view=account&settings=connections')
  }
  const goalSeconds = ownPlan ? parseTimeSpan(ownPlan.inputs.goalTime) : null
  const runsProps = {
    units, onOpen: showRun, onOpenConnections: openStravaConnections, onOpenPlan: ownPlan ? () => openOwnPlan() : undefined,
    addRuns: { open: addRunsOpen, onChange: setAddRunsOpen }, today,
    runnerId: state.kind === 'ready' ? state.runner.id : undefined,
    maxHeartRate: state.kind === 'ready' ? state.runner.maxHeartRate : null,
    race: ownPlan?.inputs.distanceKm && goalSeconds ? { distanceKm: ownPlan.inputs.distanceKm, goalSeconds } : null,
  }
  const builderInitial = plan.kind === 'ready' || plan.kind === 'error' ? plan.inputs : initial
  // On an automatic return visit, don't show step 2 of the race builder before checking whether
  // this runner already has a saved plan. An explicit builder action or shared link is unaffected.
  // A runner whose account has loaded and who has no current plan gets the builder straight away.
  const awaitingSavedTraining = view === 'build' && !editing && !initial && !landed && !justSignedUp
    && auth.enabled && (auth.loading || (auth.account !== null
      && (state.kind === 'loading' || state.kind === 'error'
        || (state.kind === 'ready' && currentPlan.current !== null && !currentPlan.failed))))
  const showBuilder = view === 'build' && (editing || plan.kind === 'idle') && !awaitingSavedTraining
  // A plan is for a runner's own account: anyone not signed in (or not finished signing up) sees which plan it is and is
  // asked to sign in, never its sessions or calendar. Accounts off (local development) shows plans as before.
  const planLocked = view === 'build' && plan.kind === 'ready' && !editing && (state.kind === 'signed-out' || state.kind === 'needs-sign-up')
  // While sign-in is still starting up nobody is known yet: show neither the plan nor the lock until it is.
  const planPending = view === 'build' && plan.kind === 'ready' && !editing && state.kind === 'loading' && !auth.account
  const showPlan = view === 'build' && plan.kind === 'ready' && !editing && !planLocked && !planPending
  // Signed in, on the builder with nothing open: wait to learn whether there's a plan to open instead.

  // Signing up comes first: until the runner has an account, the wizard's first screen is the account step.
  // Strength is part of Plan, so training always has one navigation destination.
  const onPlan = view === 'build' && plan.kind === 'ready' && !editing
  // Every plan lights Plan: a training plan, the builder while changing it, Couch to 5K and a recovery or easy-running plan.
  // The bar shows Plan whenever one of these is on screen, so the highlight never points at a missing item. Recovery is
  // also reachable from Journey, but it is a plan, so it lights Plan wherever it was opened from.
  const barCurrent: TabBarItem | null =
    view === 'home' ? 'home' : view === 'runs' ? 'runs' : view === 'journey' ? 'journey' : view === 'account' ? 'account' : view === 'recovery' || view === 'beginner' || onPlan || (view === 'build' && editing && state.kind === 'ready') ? 'plan' : null
  // The bar is for signed-in runners. It steps aside while the plan-building film plays, so the film has the whole screen.
  const cachedAccount = !!auth.account && knownHere && (state.kind === 'loading' || state.kind === 'error')
  const showBar =
    !(plan.kind === 'loading' && showBuilder) &&
    (state.kind === 'ready' || cachedAccount) && view !== 'onboarding'

  const gate: Gate | undefined =
    state.kind === 'signed-out'
      ? {
          key: 'pitch',
          title: 'Your race, your week, your plan',
          hint: 'Save your plan and track your runs.',
          body: <SignUpPitch onSignUp={auth.signUp} onSignIn={auth.signIn} />,
        }
      : state.kind === 'needs-sign-up'
        ? {
            key: 'profile',
            title: 'A bit about you',
            hint: 'Your name and time zone, then on to your race.',
            body: <ProfileForm submitLabel="Continue" onSaved={signedUp} />,
          }
        : state.kind === 'error'
          ? {
              key: 'error',
              title: state.needsSignIn ? 'Pick up where you left off' : 'We couldn’t load your account',
              hint: state.message,
              body: (
                <div className="submit-row">
                  <button type="button" className="button" onClick={state.needsSignIn ? (auth.resumeSession ?? auth.signIn) : () => runner.refresh()}>
                    {state.needsSignIn ? 'Continue securely' : 'Try again'}
                  </button>
                  {state.needsSignIn && <button type="button" className="button button-quiet" onClick={() => runner.refresh()}>Try again</button>}
                  <button type="button" className="link-button" onClick={auth.signOut}>
                    Sign out
                  </button>
                </div>
              ),
            }
          : undefined

  // A runner who agreed to an older privacy notice reads the new one before anything else. The policy itself and Account
  // (to download or delete instead) stay open.
  const gated = state.kind === 'ready' && state.runner.needsPrivacyConsent && view !== 'privacy' && view !== 'account' && view !== 'unsubscribe'

  const introAudience: IntroAudience | null = auth.enabled && auth.loading ? null : auth.account ? 'member' : 'public'
  // Do not block explicit deep links to plans, account, policy or a run. The sign-in journey
  // reaches Home after authentication and then receives its own member-specific intro.
  const introEligible = !initial && (introAudience === 'member' ? (view === 'home' || view === 'build') : view === 'build')

  return (
    <div className="page">
      <a className="skip-main" href="#main-content">Skip to main content</a>
      {introEligible && introAudience && (
        <BrandIntroGate key={introAudience} audience={introAudience} onFinished={() => {}} />
      )}
      {celebrating !== null && <StartListCelebration name={celebrating} onDone={finishCelebrating} />}
      <header className="masthead">
        <button type="button" className="wordmark wordmark-button" onClick={goHome}>
          <Wordmark />
        </button>

        {state.kind !== 'off' && state.kind !== 'ready' && (
          <nav className="masthead-nav" aria-label="Account">
            {state.kind === 'signed-out' && (
              <>
                {!phone && view === 'build' && (
                  <span className="landing-links">
                    <button type="button" className="nav-link" onClick={() => document.querySelector<HTMLElement>('.wizard-title')?.scrollIntoView({ block: 'start' })}>
                      Build a plan
                    </button>
                    <button type="button" className="nav-link" onClick={() => go('privacy')}>
                      Privacy
                    </button>
                    <a className="nav-link" href={`mailto:${PRIVACY_CONTACT.email}`}>
                      Contact
                    </a>
                  </span>
                )}
                <button type="button" className="button button-quiet" onClick={() => go('sign-in')}>
                  Sign in
                </button>
              </>
            )}
            {/* Signed in but still waiting on the account: Sign out stays reachable, so a slow server never traps anyone. */}
            {(state.kind === 'needs-sign-up' || state.kind === 'error' || (state.kind === 'loading' && auth.account !== null)) && (
              <button type="button" className="nav-link" onClick={auth.signOut}>
                Sign out
              </button>
            )}
          </nav>
        )}

      </header>
      {/* Keep appearance controls reachable on every route, even after scrolling. */}
      <ThemeToggle />

      {/* The one invitation to turn on reminders: on Home only, and not after training has ended. Setup lives in Account. */}
      {view === 'home' && state.kind === 'ready' && !state.runner.needsPrivacyConsent && !isPostTrainingHome(journey.state.kind === 'ready' ? journey.state.journey : null, ownPlan === undefined ? undefined : ownPlan?.id ?? null, today) && (
        <RemindersSection key={state.runner.id} offer />
      )}
      <main id="main-content" tabIndex={-1} key={view} className={navigated ? 'view-enter' : undefined}>
        <OfflineRunDrafts activePlanId={view === 'home' ? ownPlan?.id : showPlan ? savedOnScreen : null} />
        <ScreenRecovery>
        <Suspense fallback={<RunnerLoading label="Opening your page…" compact />}>
        {/* While the account is still loading, wait: a load that fails shows its own recovery with the same action,
            so this notice would only flash and take its button with it. */}
        {auth.error && state.kind !== 'error' && state.kind !== 'loading' && (
          <div className="callout" role="alert">
            <p>
              {auth.error.message}{' '}
              <button type="button" className="link-button" onClick={auth.account ? (auth.resumeSession ?? auth.signIn) : auth.signIn}>
                {auth.account ? 'Continue securely' : 'Try again'}
              </button>
            </p>
          </div>
        )}

        {gated && state.kind === 'ready' && (
          <PrivacyUpdate runner={state.runner} onAccepted={runner.setRunner} onOpenAccount={() => go('account')} />
        )}

        {view === 'sign-in' && state.kind === 'signed-out' && <SignInLanding onSignIn={auth.signIn} onSignUp={auth.signUp} onGoogle={auth.signInWithGoogle} onBack={() => go('build')} />}
        {view === 'sign-in' && state.kind !== 'signed-out' && <div className="empty" role="status"><p>{state.kind === 'loading' || state.kind === 'ready' ? 'Finding your training plan…' : state.kind === 'error' && state.needsSignIn ? 'Your sign-in needs renewing. Continue securely to return to your training.' : 'Finish your account setup to continue.'}</p>{state.kind === 'needs-sign-up' && <button type="button" className="button" onClick={() => go('sign-up')}>Finish setting up your account</button>}</div>}
        {view === 'onboarding' && state.kind === 'ready' && (
          <StravaWelcome hasPlan={plan.kind === 'ready'} notice={stravaNotice} connecting={stravaConnecting} onContinue={leaveStravaWelcome} />
        )}
        {view === 'privacy' && <PrivacyPolicy />}
        {view === 'unsubscribe' && <Unsubscribe token={new URLSearchParams(window.location.search).get('t')} weekly={new URLSearchParams(window.location.search).get('list') === 'weekly'} onOpenAccount={() => go('account')} />}

        {!gated && (
          <>
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
        {state.kind === 'error' && !showBuilder && view !== 'sign-in' && (
          <AccountRecovery
            message={state.message}
            needsSignIn={state.needsSignIn}
            offline={!navigator.onLine}
            onRetry={runner.refresh}
            onContinue={auth.resumeSession ?? auth.signIn}
          />
        )}

        {view === 'sign-up' && state.kind === 'needs-sign-up' && (
          <section aria-labelledby="sign-up-title" style={{ marginBottom: 'var(--space-7)' }}>
            <h2 className="plan-title" id="sign-up-title">
              Finish signing up
            </h2>
            <p className="plan-focus">A few details, then your plans are saved to your account.</p>
            <ProfileForm
              onSaved={(saved) => {
                signedUp(saved)
              }}
            />
          </section>
        )}

        {(view === 'home' || view === 'runs' || view === 'journey' || view === 'recovery' || view === 'account' || view === 'beginner' || view === 'onboarding') && state.kind === 'loading' && (
          <SignInWait onRetry={runner.refresh} onSignOut={auth.signOut} quietUntilSlow={view === 'home' && !!homeRunner} />
        )}

        {view === 'home' && homeRunner && (
          <Home
            runner={homeRunner}
            accountLoading={state.kind === 'loading'}
            photo={photo}
            units={units}
            today={today}
            current={ownPlan}
            currentPlanFailed={currentPlan.failed}
            pendingPlanId={currentPlan.pendingId}
            onRetryCurrentPlan={() => void currentPlan.refresh()}
            journey={journey}
            runs={runs ?? copy?.runs}
            bests={synced.bests ?? copy?.bests}
            strava={synced.strava ?? copy?.strava}
            initialPlan={copy?.plan}
            onPlanLoaded={savePlan}
            onOpenPlan={() => openOwnPlan()}
            onOpenJourney={openChapter}
            onOpenRecovery={openRecovery}
            onOpenRacePrep={() => { setPreparationRequest({ mode: 'race', date: null }); openOwnPlan() }}
            onOpenDay={openOwnDay}
            onBuildPlan={startFresh}
            onOpenBeginner={() => go('beginner')}
            onOpenRun={(id) => showRun(id)}
            onOpenRuns={() => go('runs')}
            onOpenAccount={openStravaConnections}
          />
        )}


        {view === 'beginner' && !gated && (state.kind === 'ready' || state.kind === 'signed-out' || state.kind === 'off') && (
          <section aria-label="Your Couch to 5K programme" className="beginner-page">
            <button type="button" className="link-button" onClick={() => go(state.kind === 'ready' ? 'home' : 'build')}>← Back</button>
            <CouchTo5K showWeek={beginnerWeek} />
          </section>
        )}

        {view === 'journey' && state.kind === 'ready' && (
          <JourneyPage key={state.runner.id} units={units} today={today} onNewRace={startFresh} onArchived={currentPlan.refresh} onOpenRecovery={openRecovery} journey={journey} />
        )}
        {view === 'recovery' && state.kind === 'ready' && <RecoveryPlanPage key={state.runner.id} units={units} today={today} journey={journey} onNewRace={startFresh} onOpenJourney={() => openChapter()} onOpenRaces={openRaces} onOpenTraining={ownPlan ? () => openOwnPlan() : undefined} />}
        {view === 'runs' && state.kind === 'ready' && (
          compact ? (
            openRun ? (
              <ActivityPage key={openRun.id} id={openRun.id} initial={openRun.uploaded} units={units} onBack={returnFromRun} backLabel={new URLSearchParams(window.location.search).has('returnTo') ? 'Back to previous page' : undefined} onDeleted={() => { setRunsVersion(v => v + 1); go('runs') }} onOpenAccount={() => go('account')} onOpenPlanDay={ownPlan ? openOwnDay : undefined} />
            ) : (
              <MyRuns {...runsProps} />
            )
          ) : (
            // On a desktop the journal stays on the left and the open run fills the right.
            <div className="runs-split">
              <MyRuns {...runsProps} key={runsVersion} selectedId={openRun?.id} />
              <div className="runs-split-detail">
                {openRun ? (
                  <ActivityPage key={openRun.id} id={openRun.id} initial={openRun.uploaded} units={units} onBack={returnFromRun} backLabel={new URLSearchParams(window.location.search).has('returnTo') ? 'Back to previous page' : undefined} onDeleted={() => { setRunsVersion(v => v + 1); go('runs') }} onOpenAccount={() => go('account')} onOpenPlanDay={ownPlan ? openOwnDay : undefined} />
                ) : (
                  <div className="runs-split-empty panel">
                    <p><strong>Choose a run</strong></p>
                    <p className="field-help">Its distance, pace, how it matched your plan and, where the recording has them, splits and heart rate open here.</p>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {view === 'account' && state.kind === 'ready' && (
          <AccountPage
            key={stravaNotice ?? 'account'}
            runner={state.runner}
            stravaNotice={stravaNotice}
            stravaConnecting={stravaConnecting}
            onSaved={runner.setRunner}
            onOpenRuns={() => go('runs')}
            onNewCalendarLink={calendarLink.replace}
            photo={photo}
            onPhotoChange={setPhoto}
            onDeleted={() => {
              go('build')
              auth.signOut()
            }}
          />
        )}

        {(view === 'home' || view === 'runs' || view === 'journey' || view === 'recovery' || view === 'account') && (state.kind === 'signed-out' || state.kind === 'off') && (
          <div className="empty signed-out-prompt">
            <TaperdayRunner pose="crouch" size={40} className="signed-out-runner" />
            <p><strong>{view === 'recovery' ? 'Your recovery plan and check-ins live in your account.' : view === 'journey' ? 'Your training chapters, races and trophies live in your account.' : view === 'runs' ? 'Your runs live in your account.' : view === 'account' ? 'Your account, connections and reminders.' : 'Your Home: today’s session, your week and your race.'}</strong></p>
            <p>Sign in to see your saved plans, runs and account. It’s free, and your plan comes with you.</p>
            <div className="submit-row" style={{ marginTop: 'var(--space-3)' }}>
              {state.kind === 'signed-out' && (
                <button type="button" className="button button-primary" onClick={auth.signIn}>
                  Sign in
                </button>
              )}
              {plan.kind === 'ready' ? (
                <button type="button" className="button button-quiet" onClick={() => pickFromBar('plan')}>Back to your plan</button>
              ) : (
                <button type="button" className="button button-quiet" onClick={() => go('build')}>Build a free plan</button>
              )}
            </div>
          </div>
        )}

        {(view === 'build' || view === 'sign-up') && (
          <>
            {/*
              Signed in, the account still answering (the API or network may be slow): the page stays usable under one line, and
              the runner's plan opens by itself once it's found. The builder runs ungated meanwhile, so the sign-up screen
              never flashes past a returning runner.
            */}
            {awaitingSavedTraining && auth.loading && (
              <RunnerLoading label="Checking your session…" compact />
            )}
            {awaitingSavedTraining && !auth.loading && auth.account && state.kind !== 'error' && (
              <FindingPlan name={auth.account.name || null} onRetry={runner.refresh} onSignOut={auth.signOut} />
            )}

            {/* Never swapped out while the account answers, so nothing the runner did meanwhile is lost. */}
            {showBuilder && (
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
                onOpenBeginner={() => go('beginner')}
                gate={gate}
                // The landing hero sells Taperday to visitors. Someone finishing sign-up (or whose account didn't load)
                // has already said yes, so they see only their step.
                // A signed-in runner is already in: no sales pitch, just the builder.
                intro={gate?.key === 'profile' || gate?.key === 'error' || state.kind === 'ready' ? undefined : (
                  <>
                    <Hero
                      races={races.kind === 'ready' ? races.races : []}
                      today={today}
                      units={units}
                      lede={
                        auth.enabled
                          ? 'A plan built around your race and your week, that keeps up with how you run.'
                          : 'A plan built around your race and your week, that keeps up with how you run. Free.'
                      }
                      onSignIn={state.kind === 'signed-out' ? auth.signIn : undefined}
                    />
                    
                    <RaceTicker races={races.kind === 'ready' ? races.races : []} units={units} />
                  </>
                )}
              />
            )}

            <div aria-live="polite" aria-busy={plan.kind === 'loading'}>
              {plan.kind === 'loading' &&
                (showBuilder ? <p className="visually-hidden">Building your plan…</p> : <RunnerLoading label="Building your plan…" compact />)}
              {plan.kind === 'error' && view === 'build' && (
                <div className="error-panel" style={{ marginTop: 'var(--space-7)' }} role="alert">
                  <strong>We couldn’t build that plan.</strong>
                  <p>{plan.message}</p>
                  <div className="submit-row" style={{ marginTop: 'var(--space-3)' }}>
                    <button type="button" className="button button-quiet" onClick={() => buildFromWizard(plan.inputs)}>
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

            {planPending && <RunnerLoading label="Opening your plan…" detail="Getting your schedule ready." compact />}
            {planLocked && plan.kind === 'ready' && (
              <PlanLocked
                plan={plan.plan}
                units={units}
                onSignIn={state.kind === 'signed-out' ? auth.signIn : undefined}
                onSignUp={state.kind === 'signed-out' ? auth.signUp : undefined}
                onFinishSignUp={state.kind === 'needs-sign-up' ? () => go('sign-up') : undefined}
              />
            )}
            {/* A plan that isn't the runner's saved one (a new race, a new goal) is never saved or lost silently. */}
            {showPlan && plan.plan.race.date >= today && state.kind === 'ready' && currentPlan.current && !savedOnScreen && (
              <ReplacePlanBar
                key={toSearchParams(plan.inputs).toString()}
                request={toRequest(plan.inputs)}
                raceName={plan.plan.race.name}
                saved={currentPlan.current}
                onReplaced={currentPlan.refresh}
                onKeep={() => openOwnPlan()}
              />
            )}
            {showPlan && savedOnScreen && <CheckInLoadState {...checkIns} />}

            {/* The calendar menu: the runner's own plan subscribes to their personal feed, which follows the plan through
                every change; a plan from a link (or anyone's, signed out) subscribes to that plan's own link. */}
            {showPlan && (
              <PlanView
                preparation={preparationRequest}
                onEditStrength={changeAnswers}
                onEditPlan={changeAnswers}
                key={`${plan.plan.race.name}|${plan.plan.race.date}|${plan.plan.startDate}`}
                plan={plan.plan}
                reveal={revealPlan}
                journeyPlanId={savedOnScreen && state.kind === 'ready' ? savedOnScreen : null}
                onNewRace={startFresh}
                onOpenJourney={() => openChapter()}
                onOpenRecovery={openRecovery}
                onSignIn={state.kind === 'signed-out' ? auth.signIn : undefined}
                // The bar's Home does this job wherever the bar is shown.
                onBack={state.kind === 'ready' && !showBar ? () => go('home') : undefined}
                units={units}
                shareUrl={`${window.location.origin}${window.location.pathname}?${toSearchParams(plan.inputs)}`}
                calendar={
                  savedOnScreen && calendarLink.token
                    ? personalCalendarLinks(calendarLink.token, plan.plan.race.name, apiOrigin())
                    : calendarLinks(toRequest(plan.inputs), units, plan.plan.race.name, apiOrigin())
                }
                today={today}
                canCompleteRuns={!savedOnScreen || checkIns.ready}
                runs={state.kind === 'ready' ? runs : undefined}
                onLoadActivity={state.kind === 'ready' ? async (id) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to view your race recording.'); return api.me.activity(token, id) } : undefined}
                bests={state.kind === 'ready' ? synced.bests : undefined}
                onOpenRun={state.kind === 'ready' ? (id) => showRun(id) : undefined}
                coach={savedOnScreen && checkIns.ready ? { today, units, get: checkIns.get, synced: stravaCompletions.get, pendingFor: session => checkIns.pending.some(item => item.key === `${session.date}|${session.type}`), save: checkIns.save, remove: checkIns.remove, entries: checkIns.entries, adjustments: {
                  reviewRemaining: async (reported) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to review your week.'); return api.me.reviewRemainingWeek(token, savedOnScreen, reported) },
                  applyRemaining: async (proposalToken, reported) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your week.'); const result = await api.me.applyRemainingWeek(token, savedOnScreen, proposalToken, reported); setPlan({ kind: 'ready', plan: result.proposed, inputs: plan.inputs }) },
                  review: async (recovery) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to review your training.'); return api.me.reviewCoaching(token, savedOnScreen, recovery) },
                  apply: async (proposalToken, recovery) => {
                    const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your training.')
                    const result = await api.me.applyCoaching(token, savedOnScreen, proposalToken, recovery)
                    setPlan({ kind: 'ready', plan: result.proposed.plan, inputs: plan.inputs })
                    setCoachNotes({ planId: savedOnScreen, notes: result.proposed.coaching ?? [] })
                  },
                  decline: async (proposalToken, recovery) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to answer the review.'); await api.me.declineCoaching(token, savedOnScreen, proposalToken, recovery) },
                  life: {
                    preview: async (change) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to change your plan.'); return api.me.previewLifeChange(token, savedOnScreen, change) },
                    apply: async (change, proposalToken) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to change your plan.'); const result = await api.me.applyLifeChange(token, savedOnScreen, change, proposalToken); setPlan({ kind: 'ready', plan: result.proposed, inputs: plan.inputs }) },
                    restore: async (dates) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to change your plan.'); const result = await api.me.restoreSessions(token, savedOnScreen, dates); setPlan({ kind: 'ready', plan: result.plan, inputs: plan.inputs }) },
                  },
                }, saveAdditional: checkIns.saveAdditional, removeAdditional: checkIns.removeAdditional } : undefined}
                coachNotes={notes}
                onInjuryReplan={() => replanWith({ from: today, setback: 'Injury' })}
                onUseGoal={(goalSeconds) => build({ ...plan.inputs, goalSeconds })}
                onReplan={replanWith}
                toolbarExtra={
                  <>
                    <SavePlanButton
                      key={toSearchParams(plan.inputs).toString()}
                      runner={state}
                      request={toRequest(plan.inputs)}
                      onDeleted={planDeleted}
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
          </>
        )}
        </Suspense>
        </ScreenRecovery>
      </main>

      {showBar && (
        <TabBar
          variant={compact ? 'bar' : 'rail'}
          current={barCurrent}
          // Journey remains available even after the runner archives their last current plan.
          hasPlan={!!ownPlan || onPlan || recovering || maintaining || view === 'recovery' || view === 'beginner'}
          onPick={pickFromBar}
          account={state.kind === 'ready' ? { name: state.runner.displayName, photo } : cachedAccount && copy?.runner ? { name: copy.runner.displayName, photo: null } : undefined}
        />
      )}

      <footer className="footer">
        {state.kind === 'ready' && <FeedbackBox page={view} />}
        <p>
          Plans are a guide, not medical advice. If something hurts, rest and get it checked. Check race dates with the organiser.
        </p>
        <p className="footer-links">
          <button type="button" className="link-button" onClick={() => go('privacy')}>
            Privacy policy
          </button>
          <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>
        </p>
      </footer>
    </div>
  )
}
