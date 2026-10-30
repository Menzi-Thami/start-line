import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Home } from '../features/runner-home/Home'
import { ProfileForm } from '../features/account/ProfileForm'
import { SavePlanButton } from '../features/account/SavePlanButton'
import { SignUpPitch } from '../features/account/SignUpPitch'
import { StartListCelebration } from '../features/account/StartListCelebration'
import { useCalendarLink } from '../features/account/useCalendarLink'
import { samePlan, sameRace, useCurrentPlan } from '../features/account/useCurrentPlan'
import { useRunner } from '../features/account/useRunner'
import { PrivacyPolicy, PrivacyUpdate } from '../features/privacy/Privacy'
import { FeedbackBox } from '../features/account/FeedbackBox'
import { FindingPlan } from '../features/account/FindingPlan'
import { Unsubscribe } from '../features/account/Unsubscribe'
import { PRIVACY_CONTACT } from '../features/privacy/privacy-notice'
import { useMediaQuery } from '../lib/use-media-query'
import { TabBar, type TabBarItem } from './TabBar'
import { ScrollProgress } from './ScrollProgress'
import { ScreenRecovery } from './ScreenRecovery'
import { SignInWait } from '../features/account/SignInWait'
import { InstallCard } from '../features/install/InstallApp'
import { RemindersSection } from '../features/reminders/Reminders'
import { useCheckIns } from '../features/coaching/useCheckIns'
import { CheckInLoadState } from '../features/coaching/CheckInLoadState'
import { BuilderForm, type FieldErrors, type Gate, type RacesState } from '../features/builder/BuilderForm'
import { Hero, RaceTicker } from '../features/home/Hero'
import { RaceStartIntro } from '../features/home/RaceStartIntro'
import { PlanView } from '../features/plan/PlanView'
import { Replan } from '../features/plan/Replan'
import { readStravaCallback, STRAVA_CALLBACK_PATH } from '../features/sync/strava-callback'
import { useSyncedRuns } from '../features/sync/useSyncedRuns'
import { api, ApiError, apiOrigin } from '../lib/api-client'
import { calendarLinks, personalCalendarLinks } from '../lib/calendar-links'
import { ownerOf, readSnapshot, saveSnapshot, type HomeSnapshot } from '../lib/home-snapshot'
import { localToday, type Units } from '../lib/format'
import { fromRequest, fromSearchParams, toRequest, toSearchParams, type PlanInputs, type ReplanInputs } from '../lib/plan-url'
import { introFitsStartup, introSeen, markIntroSeen, prefersMotion } from '../lib/motion'
import { loadUnits, saveUnits } from '../lib/storage'
import type { Activity, CoachNote, GeneratePlanRequest, Runner, TrainingPlan } from '../lib/types'
import { useAuth } from './auth-context'

const AccountPage = lazy(() => import('../features/account/AccountPage').then((module) => ({ default: module.AccountPage })))
const ActivityPage = lazy(() => import('../features/activities/ActivityPage').then((module) => ({ default: module.ActivityPage })))
const MyRuns = lazy(() => import('../features/activities/MyRuns').then((module) => ({ default: module.MyRuns })))

type PlanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; plan: TrainingPlan; inputs: PlanInputs }
  | { kind: 'error'; message: string; inputs: PlanInputs }

type View = 'home' | 'build' | 'runs' | 'account' | 'privacy' | 'sign-up' | 'unsubscribe'

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

const viewFromUrl = (): View => {
  if (window.location.pathname === STRAVA_CALLBACK_PATH) return 'account'
  const view = new URLSearchParams(window.location.search).get('view')
  // A runner has one plan, so the old My plans page is now Home.
  if (view === 'plans') return 'home'
  return view === 'home' || view === 'runs' || view === 'account' || view === 'privacy' || view === 'unsubscribe' ? view : 'build'
}

export function App() {
  const today = localToday()
  const auth = useAuth()
  const runner = useRunner()
  // The plan link the page was opened with. Starting afresh forgets it, so a blank builder is really blank.
  const [initial, setInitial] = useState(() => fromSearchParams(new URLSearchParams(window.location.search)))
  const [view, setView] = useState<View>(viewFromUrl)
  const [preparationRequest, setPreparationRequest] = useState<{ mode: 'long' | 'race'; date: string | null } | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('prepare')
    return mode === 'long' || mode === 'race' ? { mode, date: params.get('date') } : null
  })
  // On a phone the app's navigation sits in a bar at the bottom, as an installed app's does; wider, it stays in the header.
  const phone = useMediaQuery('(max-width: 47.99rem)')
  // Plan navigation can return to the current week from any training detail.
  const [planTabAsk, setPlanTabAsk] = useState<{ id: string; seq: number } | undefined>(undefined)
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
  // A plan that has just arrived from the API reveals its parts in turn; one opened from the device's copy is simply there.
  const [revealPlan, setRevealPlan] = useState(false)
  const [freshBuild, setFreshBuild] = useState(false)
  // The starting-gun intro: once per visit, only when landing on the builder, never for reduced motion.
  const [playIntro, setPlayIntro] = useState(() => !initial && prefersMotion() && !introSeen() && introFitsStartup(window.performance.now()))
  const finishIntro = useCallback(() => setPlayIntro(false), [])
  // Who just made the start list, while their celebration plays.
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const finishCelebrating = useCallback(() => setCelebrating(null), [])
  const inflight = useRef<AbortController | null>(null)
  const editingSavedPlan = useRef<string | null>(null)
  useEffect(() => () => inflight.current?.abort(), [auth.account?.email, auth.account?.name])

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
  const fetchPlan = useCallback((inputs: PlanInputs, beforeShow?: (request: ReturnType<typeof toRequest>, signal: AbortSignal) => Promise<void>) => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller

    const withDate = { ...inputs, planFrom: inputs.planFrom ?? localToday() }
    if (!beforeShow) window.history.replaceState(null, '', `?${toSearchParams(withDate)}`)

    api
      .plan(toRequest(withDate), controller.signal)
      .then(async (result) => {
        if (controller.signal.aborted) return
        await beforeShow?.(toRequest(withDate), controller.signal)
        if (controller.signal.aborted) return
        window.history.replaceState(null, '', `?${toSearchParams(withDate)}`)
        setPlan({ kind: 'ready', plan: result, inputs: withDate })
        setRevealPlan(true)
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
    const own = currentPlan.current
    if (editing && own && own.id === editingSavedPlan.current && sameRace(toRequest(inputs), own.inputs)) {
      setFieldErrors({})
      setPlan({ kind: 'loading' })
      fetchPlan(inputs, async (request, signal) => {
        const token = await auth.getToken()
        if (!token) throw new ApiError('Sign in again to save your updated plan.', 401)
        const saved = await api.me.savePlan(token, request, own.name, true, own.id, signal)
        if (signal.aborted) return
        currentPlan.remember({ id: saved.id, name: saved.name, inputs: request })
        editingSavedPlan.current = null
      })
      return
    }
    setFreshBuild(plan.kind !== 'ready')
    setEditing(true)
    build(inputs)
  }

  const changeAnswers = () => {
    editingSavedPlan.current = savedOnScreen
    // Remount so the wizard starts from this plan's answers, on its summary screen.
    setBuilderKey((k) => k + 1)
    setEditing(true)
    window.scrollTo?.({ top: 0 })
  }

  const backToPlan = () => {
    editingSavedPlan.current = null
    setEditing(false)
    window.scrollTo?.({ top: 0 })
  }

  useEffect(() => {
    if (playIntro) markIntroSeen()
  }, [playIntro])

  // The runner's runs (uploaded and synced), bests and Strava status, shown inside the plan. Loaded when the plan
  // view opens, so a new upload or a run that just arrived from Strava appears.
  const synced = useSyncedRuns(runner.state.kind === 'ready' && (view === 'build' || view === 'home'))
  const currentPlan = useCurrentPlan(runner.state.kind === 'ready')
  const landing = useRef(false)
  const [landed, setLanded] = useState(false)
  // Someone who has just signed up has no plan to open, so the builder never waits for one.
  const [justSignedUp, setJustSignedUp] = useState(false)
  const runs = synced.runs

  // The runner's last-seen Home, kept on this device, so it shows at once while the account refreshes. Read once per
  // account; each piece is replaced as this visit's answer arrives, and saved again for next time.
  const owner = auth.account ? ownerOf(auth.account) : null
  const [snapshot, setSnapshot] = useState<{ owner: string; copy: HomeSnapshot | null } | null>(null)
  if (owner && snapshot?.owner !== owner) setSnapshot({ owner, copy: readSnapshot(owner) })
  const copy = owner && snapshot?.owner === owner ? snapshot.copy : null
  const ready = runner.state.kind === 'ready' ? runner.state.runner : null
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
  const savedOnScreen =
    plan.kind === 'ready' && currentPlan.current && samePlan(toRequest(plan.inputs), currentPlan.current.inputs) ? currentPlan.current.id : null
  const checkIns = useCheckIns(savedOnScreen)
  // On the runner's own plan, the calendar menu subscribes to their personal feed, which follows every change to it.
  const calendarLink = useCalendarLink(owner, savedOnScreen !== null)

  // The runner's plan from the copy on this device, opened at once on a return visit while the account loads. It gives
  // way to this visit's plan as soon as that's on screen.
  const [fromCopy, setFromCopy] = useState<{ plan: TrainingPlan } | null>(null)

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

  // Signed in with a plan: open inside it, not on the builder or Home. From the plan this device kept when there is one,
  // straight away; otherwise built afresh from its answers, which needs only the API, never the sleeping database. Signed
  // in without a plan: Home, which offers one. Once per visit, and never over a plan link they opened.
  // The plan this visit found, or until then the one last seen on this device, so the plan opens without waiting.
  const ownPlan = currentPlan.current !== undefined ? currentPlan.current : (copy?.current ?? undefined)
  const found = ownPlan
  // A runner this device already knows opens from the copy too, plan or no plan, so the waiting film only plays when
  // there's nothing to show yet: a first sign-in here, or a brand new account.
  const knownHere = copy?.runner !== undefined
  const latestPlan = currentPlan.current
  useEffect(() => {
    if (landing.current || !(found || knownHere) || initial || view !== 'build' || plan.kind !== 'idle' || editing) return
    landing.current = true
    // A runner coming back with their plan kept on this device opens straight on it, as opening it from Home would show
    // it, while the account loads. Only before this visit has found their plan: after that, Home opens it for real.
    const copied =
      latestPlan === undefined && copy?.current && copy.plan?.id === copy.current.id
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
  }, [found, knownHere, initial, view, plan.kind, editing, copy, latestPlan])

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
  // A shared link builds its plan straight away.
  useEffect(() => {
    if (initial) fetchPlan(initial)
    return () => inflight.current?.abort()
  }, [initial, fetchPlan])

  // Moving to another page adds a history entry, so the browser's Back button comes back here instead of leaving
  // Taperday. Changes within a page (a plan's link as it's rebuilt) replace the entry.
  const moveTo = (query: string, toAnotherPage: boolean) => {
    const url = query || window.location.pathname
    if (toAnotherPage) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }

  // Plan opens the runner's current week, or the builder when they have no plan.
  const pickFromBar = (item: TabBarItem) => {
    if (item === 'home') return go('home')
    if (item === 'runs') return go('runs')
    if (item === 'account') return go('account')
    setPlanTabAsk((asked) => ({ id: 'week', seq: (asked?.seq ?? 0) + 1 }))
    if (view === 'build' && plan.kind === 'ready') return
    if (ownPlan) openOwnPlan()
    else go('build')
  }

  const go = (next: View) => {
    setPreparationRequest(null)
    // Going somewhere on purpose means the app no longer opens the current plan by itself.
    landing.current = true
    setLanded(true)
    setView(next)
    setOpenRun(null)
    // The build view keeps the plan link in the URL; the others get a plain view parameter.
    const query =
      next === 'home' || next === 'runs' || next === 'account' || next === 'privacy'
        ? `?view=${next}`
        : plan.kind === 'ready' || plan.kind === 'error'
          ? `?${toSearchParams(plan.inputs)}`
          : ''
    moveTo(query, next !== view || openRun !== null)
    window.scrollTo?.({ top: 0 })
  }

  const showRun = (id: string, uploaded?: Activity) => {
    setView('runs')
    setOpenRun({ id, uploaded })
    moveTo(`?view=runs&run=${encodeURIComponent(id)}`, true)
    window.scrollTo?.({ top: 0 })
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
  const openOwnPlan = () => {
    const own = ownPlan
    if (!own) return
    moveTo(window.location.search, true)
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
    setView('build')
    // Remount the form so it shows the saved plan's choices, not whatever was typed before.
    setBuilderKey((k) => k + 1)
    setEditing(false)
    build(inputs)
  }

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

  const changeUnits = (next: Units) => {
    setUnits(next)
    saveUnits(next)
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
  // Strength is part of Plan, so training always has one navigation destination.
  const barCurrent: TabBarItem | null =
    view === 'home' ? 'home' : view === 'runs' ? 'runs' : view === 'account' ? 'account' : view === 'build' && plan.kind === 'ready' ? 'plan' : null

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

  // A runner who agreed to an older privacy notice reads the new one before anything else. The policy itself and Account
  // (to download or delete instead) stay open.
  const gated = state.kind === 'ready' && state.runner.needsPrivacyConsent && view !== 'privacy' && view !== 'account' && view !== 'unsubscribe'

  return (
    <div className="page">
      {playIntro && <RaceStartIntro onDone={finishIntro} />}
      {celebrating !== null && <StartListCelebration name={celebrating} onDone={finishCelebrating} />}
      <header className="masthead">
        <button type="button" className="wordmark wordmark-button" onClick={goHome}>
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

        {state.kind !== 'off' && (state.kind !== 'ready' || !phone) && (
          <nav className="masthead-nav" aria-label={state.kind === 'ready' ? 'Main' : 'Account'}>
            {state.kind === 'signed-out' && (
              <button type="button" className="button button-quiet" onClick={auth.signIn}>
                Sign in
              </button>
            )}
            {/* Signed in but still waiting on the account: Sign out stays reachable, so a slow server never traps anyone. */}
            {(state.kind === 'ready' || state.kind === 'needs-sign-up' || state.kind === 'error' || (state.kind === 'loading' && auth.account !== null)) && (
              <>
                {state.kind === 'ready' && !phone && (
                  <>
                    <button type="button" className="nav-link" aria-current={view === 'home' ? 'page' : undefined} onClick={() => go('home')}>
                      Home
                    </button>
                    <button type="button" className="nav-link" aria-current={view === 'build' && plan.kind === 'ready' ? 'page' : undefined} onClick={() => pickFromBar('plan')}>
                      Plan
                    </button>
                    <button type="button" className="nav-link" aria-current={view === 'runs' ? 'page' : undefined} onClick={() => go('runs')}>
                      Runs
                    </button>
                    <button type="button" className="nav-link" aria-current={view === 'account' ? 'page' : undefined} onClick={() => go('account')}>
                      Account
                    </button>
                  </>
                )}
                {state.kind !== 'ready' && <button type="button" className="nav-link" onClick={auth.signOut}>
                  Sign out
                </button>}
              </>
            )}
          </nav>
        )}
      </header>

      <ScrollProgress />
      {state.kind === 'ready' && !state.runner.needsPrivacyConsent && (
        <div hidden={view === 'account' || view === 'privacy' || view === 'unsubscribe'}><RemindersSection key={state.runner.id} offer /></div>
      )}
      <main key={view} className={navigated ? 'view-enter' : undefined}>
        <ScreenRecovery>
        <Suspense fallback={<div className="panel skeleton-stack" role="status" aria-label="Loading page"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /><span className="skeleton-line skeleton-line-short" /></div>}>
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

        {gated && state.kind === 'ready' && (
          <PrivacyUpdate runner={state.runner} onAccepted={runner.setRunner} onOpenAccount={() => go('account')} />
        )}

        {view === 'privacy' && <PrivacyPolicy />}
        {view === 'unsubscribe' && <Unsubscribe token={new URLSearchParams(window.location.search).get('t')} onOpenAccount={() => go('account')} />}

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

        {(view === 'home' || view === 'runs' || view === 'account') && state.kind === 'loading' && !(view === 'home' && homeRunner) && (
          <SignInWait onRetry={runner.refresh} onSignOut={auth.signOut} />
        )}

        {view === 'home' && homeRunner && (
          <Home
            runner={homeRunner}
            photo={photo}
            units={units}
            today={today}
            current={ownPlan}
            runs={runs ?? copy?.runs}
            bests={synced.bests ?? copy?.bests}
            strava={synced.strava ?? copy?.strava}
            initialPlan={copy?.plan}
            onPlanLoaded={savePlan}
            onOpenPlan={openOwnPlan}
            onBuildPlan={startFresh}
            onOpenRun={(id) => showRun(id)}
            onOpenRuns={() => go('runs')}
            onOpenAccount={() => go('account')}
          />
        )}


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
            <MyRuns units={units} onOpen={showRun} onOpenPlan={ownPlan ? () => { openOwnPlan(); setPlanTabAsk(asked => ({ id: 'all', seq: (asked?.seq ?? 0) + 1 })) } : undefined} />
          ))}

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

        {(view === 'home' || view === 'runs' || view === 'account') && (state.kind === 'signed-out' || state.kind === 'off') && (
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
            {/*
              Signed in, the account still answering (the API or network may be slow): the page stays usable under one line, and
              the runner's plan opens by itself once it's found. The builder runs ungated meanwhile, so the sign-up screen
              never flashes past a returning runner.
            */}
            {showBuilder && auth.account && (state.kind === 'loading' || opening) && (
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
                gate={gate}
                intro={
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

            {showPlan && <InstallCard />}
            {showPlan && savedOnScreen && <CheckInLoadState ready={checkIns.ready} failed={checkIns.failed} retry={checkIns.retry} />}

            {/* The calendar menu: the runner's own plan subscribes to their personal feed, which follows the plan through
                every change; a plan from a link (or anyone's, signed out) subscribes to that plan's own link. */}
            {showPlan && (
              <PlanView
                preparation={preparationRequest}
                onEditStrength={changeAnswers}
                key={`${plan.plan.race.name}|${plan.plan.race.date}|${plan.plan.startDate}`}
                plan={plan.plan}
                reveal={revealPlan}
                openTab={planTabAsk}
                onBack={state.kind === 'ready' ? () => go('home') : undefined}
                units={units}
                onUnitsChange={changeUnits}
                shareUrl={`${window.location.origin}${window.location.pathname}?${toSearchParams(plan.inputs)}`}
                calendar={
                  savedOnScreen && calendarLink.token
                    ? personalCalendarLinks(calendarLink.token, plan.plan.race.name, apiOrigin())
                    : calendarLinks(toRequest(plan.inputs), units, plan.plan.race.name, apiOrigin())
                }
                today={today}
                canCompleteRuns={!savedOnScreen || checkIns.ready}
                runs={state.kind === 'ready' ? runs : undefined}
                bests={state.kind === 'ready' ? synced.bests : undefined}
                strava={state.kind === 'ready' ? synced.strava : undefined}
                onOpenAccount={state.kind === 'ready' ? () => go('account') : undefined}
                onOpenRuns={state.kind === 'ready' ? () => go('runs') : undefined}
                onOpenRun={state.kind === 'ready' ? (id) => showRun(id) : undefined}
                coach={savedOnScreen && checkIns.ready ? { today, units, get: checkIns.get, save: checkIns.save, remove: checkIns.remove, entries: checkIns.entries, adjustments: {
                  reviewRemaining: async () => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to review your week.'); return api.me.reviewRemainingWeek(token, savedOnScreen) },
                  applyRemaining: async (proposalToken) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your week.'); const result = await api.me.applyRemainingWeek(token, savedOnScreen, proposalToken); setPlan({ kind: 'ready', plan: result.proposed, inputs: plan.inputs }) },
                  review: async (recovery) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to review your training.'); return api.me.reviewCoaching(token, savedOnScreen, recovery) },
                  apply: async (proposalToken, recovery) => {
                    const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your training.')
                    const result = await api.me.applyCoaching(token, savedOnScreen, proposalToken, recovery)
                    setPlan({ kind: 'ready', plan: result.proposed.plan, inputs: plan.inputs })
                    setCoachNotes({ planId: savedOnScreen, notes: result.proposed.coaching ?? [] })
                  },
                }, saveAdditional: checkIns.saveAdditional, removeAdditional: checkIns.removeAdditional } : undefined}
                coachNotes={notes}
                onInjuryReplan={() => replanWith({ from: today, setback: 'Injury' })}
                onUseGoal={(goalSeconds) => build({ ...plan.inputs, goalSeconds })}
                replan={
                  <Replan
                    plan={plan.plan}
                    today={today}
                    units={units}
                    onReplan={replanWith}
                    onUseGoal={(goalSeconds) => build({ ...plan.inputs, goalSeconds })}
                  />
                }
                toolbarExtra={
                  <>
                    <button type="button" className="button button-quiet" onClick={changeAnswers}>
                      Change answers
                    </button>
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

      {phone && state.kind === 'ready' && <TabBar current={barCurrent} onPick={pickFromBar} account={{ name: state.runner.displayName, photo }} />}

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
