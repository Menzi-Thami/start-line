import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import { useAuth } from '../../app/auth-context'
import { ScreenRecovery } from '../../app/ScreenRecovery'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, parseTimeSpan, type Units } from '../../lib/format'
import { planProgress } from '../../lib/plan-day'
import { allowsSwipe, horizontalSwipe } from '../../lib/swipe'
import { ranKmByWeek, runsByDate, weekEnd } from '../../lib/plan-runs'
import type { ActivitySummary, CoachNote, LoggedRun, PersonalBest, PlanWeek, Runner, Session, StravaStatus, TrainingPlan } from '../../lib/types'
import { Avatar } from '../account/Avatar'
import type { CurrentPlan } from '../account/useCurrentPlan'
import { PlanAdjustment } from '../coaching/PlanAdjustment'
import { RunLog } from '../coaching/RunLog'
import { CheckInCard } from '../coaching/CheckInCard'
import { offersTick } from '../coaching/ran-this'
import { RanThis } from '../coaching/RanThis'
import { useCheckIns, type SessionCoach } from '../coaching/useCheckIns'
import { weekSoFar } from '../dashboard/dashboard-math'
import { InstallCard } from '../install/InstallApp'
import { SessionSteps } from '../plan/SessionSteps'
import { change, todayInPlan, trainingTotals, weeklyBars, type Change } from './home-math'
import { YourWeek } from './YourWeek'
import { WeeklyChart } from './WeeklyChart'

const Calculators = lazy(() => import('./Calculators').then((module) => ({ default: module.Calculators })))

interface Props {
  runner: Runner
  units: Units
  today: string
  /** The runner's current plan, null when they have none, undefined while it's being found. */
  current: CurrentPlan | null | undefined
  runs?: ActivitySummary[]
  bests?: PersonalBest[]
  strava?: StravaStatus
  onOpenPlan: () => void
  onBuildPlan: () => void
  onOpenRun: (id: string) => void
  onOpenRuns: () => void
  onOpenAccount: () => void
  /** The plan as last seen on this device, shown until this visit's has loaded. */
  initialPlan?: HomePlan | null
  /** This visit's plan, once it has loaded, so the device can keep a copy. */
  onPlanLoaded?: (plan: HomePlan) => void
  /** The runner's own picture, if they added one; their initials otherwise. */
  photo?: string | null
}

type HomePlan = { id: string; plan: TrainingPlan }

/** The race distances worth a place on Home; the plan's Overview and the run pages list the rest. */
const HEADLINE_BESTS = [5000, 10000, 21097.5, 42195]

/**
 * The runner's plan, as the coach has it this week, and the coach's calls on it. Without it Home still shows their running.
 * The calls come with this visit's plan only: the copy kept on the device has the plan alone.
 */
function useHomePlan(
  current: CurrentPlan | null | undefined,
  initial?: HomePlan | null,
  onLoaded?: (plan: HomePlan) => void,
): { plan: TrainingPlan | null; coaching: CoachNote[]; failed: boolean; retry: () => void } {
  const auth = useAuth()
  const [plan, setPlan] = useState<HomePlan | null>(null)
  const [coaching, setCoaching] = useState<{ id: string; notes: CoachNote[] } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<{ id: string; attempt: number } | null>(null)
  const loaded = useRef(onLoaded)
  useEffect(() => {
    loaded.current = onLoaded
  }, [onLoaded])
  useEffect(() => {
    if (!current) return
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.coachPlan(token, current.id) : null))
      .then((saved) => {
        if (cancelled) return
        if (!saved) { setFailure({ id: current.id, attempt }); return }
        const found = { id: current.id, plan: saved.plan }
        setFailure(null)
        setPlan(found)
        setCoaching({ id: current.id, notes: saved.coaching ?? [] })
        loaded.current?.(found)
      })
      .catch(() => { if (!cancelled) setFailure({ id: current.id, attempt }) })
    return () => {
      cancelled = true
    }
  }, [current, auth, attempt])
  // Until this visit's plan arrives, the copy from last time (if it's the same plan) stands in for it.
  const shown = plan && current && plan.id === current.id ? plan : initial
  return {
    plan: shown && current && shown.id === current.id ? shown.plan : null,
    coaching: coaching && current && coaching.id === current.id ? coaching.notes : [],
    failed: failure?.id === current?.id && failure?.attempt === attempt,
    retry: () => setAttempt((v) => v + 1),
  }
}

/**
 * The runs behind "Your running": sessions ticked off, at the plan's distance, and uploads. Never Strava runs, which stay
 * 7 days. Null until it has loaded; loaded again when a tick or check-in changes it.
 */
function useRunningLog(version: number): { log: LoggedRun[] | null; failed: boolean } {
  const auth = useAuth()
  const [log, setLog] = useState<LoggedRun[] | null>(null)
  const [failedVersion, setFailedVersion] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.running(token) : null))
      .then((runs) => {
        if (!cancelled) {
          if (runs) { setLog(runs); setFailedVersion(null) }
          else setFailedVersion(version)
        }
      })
      .catch(() => { if (!cancelled) setFailedVersion(version) })
    return () => {
      cancelled = true
    }
  }, [auth, version])
  return { log, failed: failedVersion === version }
}

const dayName = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })

/** The session a "ran it?" notification opened Home on (`tick=2026-10-20.Tempo`), if any. */
function tickFromUrl(): { date: string; type: string } | null {
  const [date, type] = (new URLSearchParams(window.location.search).get('tick') ?? '').split('.')
  return date && type ? { date, type } : null
}

/**
 * The session a "ran it?" notification was about, when it isn't today's (today's is on the Today card): "Ran this? Tick
 * it", then the usual check-in once it's ticked.
 */
function TickCard({ plan, today, coach, runs }: { plan: TrainingPlan | null; today: string; coach?: SessionCoach; runs: ActivitySummary[] }) {
  const [wanted] = useState(tickFromUrl)
  const [ticked, setTicked] = useState(false)
  const session = wanted && plan?.weeks.flatMap((w) => w.sessions).find((s) => s.date === wanted.date && s.type === wanted.type)
  if (!session || !coach || session.date === today || !(ticked || offersTick(session, coach, runs))) return null
  return (
    <section className="panel home-card" aria-labelledby="home-tick">
      <h2 id="home-tick" className="home-card-heading">
        {dayName.format(new Date(`${session.date}T00:00:00Z`))}’s {session.title}
      </h2>
      {ticked ? (
        <>
          <p>Ticked off. It counts towards your running now.</p>
          <CheckInCard session={session} coach={coach} />
        </>
      ) : (
        <RanThis session={session} coach={coach} runs={runs} onTicked={() => setTicked(true)} />
      )}
    </section>
  )
}

function ChangeLine({ value, units, against }: { value: Change; units: Units; against: string }) {
  if (value.delta === 0) return <p className="home-change">Level with {against}</p>
  const up = value.delta > 0
  return (
    <p className={`home-change ${up ? 'home-change-up' : 'home-change-down'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {formatDistance(Math.abs(value.delta), units)}
      {value.percent != null && ` (${Math.abs(value.percent)}%)`} {up ? 'more than' : 'less than'} {against}
    </p>
  )
}

function Tile({ label, value, unit, sub, children }: { label: string; value: string; unit: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="home-tile">
      <p className="home-tile-label">{label}</p>
      <p className="home-tile-value">
        <span className="mono">{value}</span> <span className="home-tile-unit">{unit}</span>
      </p>
      <p className="field-help">{sub}</p>
      {children}
    </div>
  )
}

/** A distance's number alone, for a tile that shows its unit apart: "91.3". */
const amount = (km: number, units: Units) => formatDistance(km, units).split(' ')[0]!

/**
 * This week as a ring: distance run against the plan's distance. Purely a picture; the words beside it say the same.
 * It fills from empty to the real distance when it appears, then moves from old to new when a run arrives. Nothing
 * runs to a made-up value first, and a week with nothing run stays empty.
 */
function WeekRing({ ran, planned }: { ran: number; planned: number }) {
  const r = 42
  const circumference = 2 * Math.PI * r
  const fraction = planned > 0 ? Math.min(1, ran / planned) : 0
  return (
    <svg className="home-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="home-ring-track" />
      {fraction > 0 && (
        <circle
          cx="50"
          cy="50"
          r={r}
          className="home-ring-fill"
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          style={{ '--ring-empty': `0 ${circumference}` } as React.CSSProperties}
          transform="rotate(-90 50 50)"
        />
      )}
    </svg>
  )
}

const PHASES: Record<PlanWeek['phase'], string> = { Base: 'Base', Build: 'Build', Peak: 'Peak', Taper: 'Taper', RaceWeek: 'Race week' }

/** The race at a glance under the greeting: when, how far, and where the runner is in the plan. */
function RaceLine({ plan, week, units }: { plan: TrainingPlan; week: PlanWeek | null; units: Units }) {
  return (
    <p className="home-race-line mono">
      <span>{formatDate(plan.race.date)}</span>
      <span>{formatDistance(plan.race.distanceKm, units)}</span>
      {week && (
        <span>
          Week {week.number} of {plan.weeks.length} · {PHASES[week.phase]}
        </span>
      )}
    </p>
  )
}

/**
 * Today's session from the runner's plan. The card and its button stay put while the plan loads, so a tap on "Open your
 * plan" always lands, however quickly it comes.
 */
function TodayCard({ plan, failed, today, units, runs, coach, onOpenPlan }: { plan: TrainingPlan | null; failed: boolean; today: string; units: Units; runs: ActivitySummary[]; coach?: SessionCoach; onOpenPlan: () => void }) {
  return (
    <section className="panel home-card home-today" aria-labelledby="home-today">
      <h2 id="home-today" className="home-card-heading">
        Today
      </h2>
      {plan ? <TodaysRuns plan={plan} today={today} units={units} runs={runs} coach={coach} /> : failed ? <p>Today’s session will appear when your plan loads.</p> : <div className="skeleton-stack" role="status" aria-label="Loading today's session"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /><span className="skeleton-line skeleton-line-short" /></div>}
      <button type="button" className="button button-primary" onClick={onOpenPlan}>
        Open your plan
      </button>
    </section>
  )
}

function TodaysRuns({ plan, today, units, runs, coach }: { plan: TrainingPlan; today: string; units: Units; runs: ActivitySummary[]; coach?: SessionCoach }) {
  const progress = planProgress(plan, today)
  const day = todayInPlan(plan, today)
  const byZone = new Map(plan.paces.map((p) => [p.zone, p]))
  const pace = (s: Session) => {
    const zone = s.zone ? byZone.get(s.zone) : undefined
    return zone ? formatPaceRange(zone.fastestSecondsPerKm, zone.slowestSecondsPerKm, units) : null
  }
  // Done is the runner's own word once their check-ins are in: a tick or check-in, or a run they uploaded. A run Strava sent
  // alone doesn't make it done; the card asks them to tick it instead.
  const ranToday = runs.some((r) => !coach?.entries?.some((c) => c.isAdditional && c.activityId === r.id) && r.localDate === today && r.kind !== 'Other' && (!coach || r.source.kind !== 'Strava'))
  const isDone = (s: Session) => {
    const checkIn = coach?.get(s)
    return checkIn ? checkIn.status !== 'Skipped' : ranToday
  }

  const body = (() => {
    if (progress.kind === 'before') return <p>Your plan starts {formatDate(plan.startDate, 'long')}. Easy running until then.</p>
    if (progress.kind === 'race') return <p className="home-today-title">Race day. Everything you’ve run was for this. Go and enjoy it.</p>
    if (progress.kind === 'after') return <p>Race done. Time to rest, then pick the next one.</p>
    if (day.runs.length === 0) {
      return (
        <>
          <p className="home-today-title">{day.strength.length > 0 ? 'No run today' : 'Rest day'}</p>
          <p>{day.strength.length > 0 ? 'Your running takes a break. Your strength session is below.' : 'Legs up. Rest is when the training turns into fitness.'}</p>
          {day.next && (
            <p className="field-help">
              Next: {day.next.title}, {formatDate(day.next.date)}
              {day.next.distanceKm > 0 ? ` · ${formatDistance(day.next.distanceKm, units)}` : ''}
            </p>
          )}
        </>
      )
    }
    // The facts first: what, how far, how fast and whether it's done. How to run it and why sit one tap away.
    return day.runs.map((s) => (
      <div key={`${s.date}|${s.type}`} className={`home-today-run${isDone(s) ? ' is-done' : ''}`}>
        <p className="home-today-title">
          {s.title}
          {isDone(s) && <span className="chip chip-good home-done-chip">Done</span>}
        </p>
        <dl className="home-workout-facts">
          {s.distanceKm > 0 && <div><dt>Distance</dt><dd className="mono">{formatDistance(s.distanceKm, units)}</dd></div>}
          {pace(s) && <div><dt>Target pace</dt><dd className="mono">{pace(s)}</dd></div>}
        </dl>
        {(s.steps.length > 0 || s.purpose || s.detail) && (
          <details className="home-today-more">
            <summary>{s.steps.length > 0 ? 'How to run it, and why' : s.purpose ? 'Why this run' : 'How to run it'}</summary>
            <p className="field-help">{s.detail}</p>
            <SessionSteps steps={s.steps} units={units} />
            <p className="home-today-why">Why: {s.purpose}</p>
          </details>
        )}
        {/* Once it's ticked or checked in on, the usual check-in: how it felt, or a change of mind. */}
        {coach && <CheckInCard session={s} coach={coach} runs={runs} completion done={isDone(s)} />}
      </div>
    ))
  })()

  return (
    <>
      {body}
      {coach && <RunLog plan={plan} coach={coach} runs={runs} />}
      {coach?.adjustments && <details className="disclosure"><summary>Review and adjust training</summary><PlanAdjustment current={plan} units={units} actions={coach.adjustments} /></details>}
      {day.strength.map((s) => (
        <section className="home-today-strength" aria-label="Strength session" key={`${s.date}|${s.type}`}>
          <p className="wait-tip-label">Strength session</p>
          <p className="home-today-title">{s.title}</p>
          <p className="field-help">{s.detail}</p>
          <p className="field-help">Open your plan for the exercises and set tracking.</p>
        </section>
      ))}
    </>
  )
}

/**
 * One line, only when Strava could send runs and isn't: connecting is set up once, in Account, so Home doesn't list
 * every way in each time. Account has the full list.
 */
function StravaNudge({ strava, onOpenAccount }: { strava?: StravaStatus; onOpenAccount: () => void }) {
  if (!strava?.available || (strava.connected && strava.status !== 'NeedsReconnect')) return null
  return (
    <p className="home-nudge">
      {strava.connected ? 'Strava has stopped sending your runs.' : 'Connect Strava and your runs arrive by themselves.'}{' '}
      <button type="button" className="link-button" onClick={onOpenAccount}>
        {strava.connected ? 'Connect again' : 'Connect Strava'}
      </button>
    </p>
  )
}

type HomeTab = 'today' | 'tools'

const HOME_TABS: readonly { id: HomeTab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tools', label: 'Tools' },
]

/** The tab in the address (`tab=`), so a shared link or Back from a run opens the same one. An old Progress link opens Today, where progress now is. */
function tabFromUrl(): HomeTab {
  const tab = new URLSearchParams(window.location.search).get('tab')
  return HOME_TABS.some((t) => t.id === tab) ? (tab as HomeTab) : 'today'
}

/**
 * This week's runs from the plan, day by day, so the plan is on Home without opening it: done (a run was recorded that
 * day), today, still to come, or gone by.
 */
function WeekRuns({ week, today, units, ranOn }: { week: PlanWeek; today: string; units: Units; ranOn: (date: string) => boolean }) {
  const sessions = week.sessions.filter((s) => s.type !== 'Strength')
  if (sessions.length === 0) return null
  return (
    <ol className="home-week-runs" aria-label="This week’s runs">
      {sessions.map((s) => {
        const state = ranOn(s.date) ? 'done' : s.date === today ? 'today' : s.date < today ? 'missed' : 'ahead'
        return (
          <li key={`${s.date}|${s.type}`} className={`home-week-run is-${state}`}>
            <span className="home-week-run-day">{formatDate(s.date, 'weekday')}</span>
            <span className="home-week-run-title">{s.title}</span>
            <span className="mono home-week-run-km">{s.distanceKm > 0 ? formatDistance(s.distanceKm, units) : ''}</span>
            <span className="visually-hidden">{state === 'done' ? ', done' : state === 'today' ? ', today' : ''}</span>
            {state === 'done' && (
              <span className="home-week-run-mark" aria-hidden="true">
                ✓
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function tabToUrl(tab: HomeTab) {
  const params = new URLSearchParams(window.location.search)
  if (tab === 'today') params.delete('tab')
  else params.set('tab', tab)
  const query = params.toString()
  // Replaced, not pushed: tabs are one page, as on the plan, so Back leaves Home rather than stepping through them.
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
}

/**
 * Home for a signed-in runner. Today, where it opens: what's on today, this week's runs from the plan and how the week
 * is going, then their running over the months, week by week, and their bests, all in one place without a tap. Tools:
 * the calculators. Built from
 * their own runs, so it's useful with or without a plan. A plan adds today's session, this week's ring and the planned
 * distance behind each week's bar. While the account loads it can show the copy kept on this device, saying so, and
 * fills in as each answer arrives.
 */
export function Home({
  runner,
  units,
  today,
  current,
  runs = [],
  bests,
  strava,
  onOpenPlan,
  onBuildPlan,
  onOpenRun,
  onOpenRuns,
  onOpenAccount,
  initialPlan,
  onPlanLoaded,
  photo = null,
}: Props) {
  const auth = useAuth()
  const [tab, setTab] = useState<HomeTab>(tabFromUrl)
  const [toolsOpened, setToolsOpened] = useState(() => tab === 'tools')
  const [tabDirection, setTabDirection] = useState<'forward' | 'back' | null>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const { plan, coaching, failed: planFailed, retry: retryPlan } = useHomePlan(current, initialPlan, onPlanLoaded)
  const checkIns = useCheckIns(current?.id ?? null)
  // A tick or check-in made here changes the totals, so they're fetched again after each.
  const [logVersion, setLogVersion] = useState(0)
  const [requestedRun, setRequestedRun] = useState<ActivitySummary | undefined>(undefined)
  const { log, failed: logFailed } = useRunningLog(logVersion)
  const coach: SessionCoach | undefined = checkIns.ready
    ? {
        today,
        units,
        get: checkIns.get,
        entries: checkIns.entries,
        adjustments: current ? {
          reviewRemaining: async () => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to review your week.'); return api.me.reviewRemainingWeek(token, current.id) },
                  applyRemaining: async (proposalToken) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your week.'); const result = await api.me.applyRemainingWeek(token, current.id, proposalToken); void result; retryPlan() },
                  review: async (recovery) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to review your training.'); return api.me.reviewCoaching(token, current.id, recovery) },
          apply: async (proposalToken, recovery) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your training.'); await api.me.applyCoaching(token, current.id, proposalToken, recovery); retryPlan() },
        } : undefined,
        saveAdditional: async (id, session, answers) => { await checkIns.saveAdditional(id, session, answers); setLogVersion((v) => v + 1) },
        removeAdditional: async (id) => { await checkIns.removeAdditional(id); setLogVersion((v) => v + 1) },
        save: async (session, answers) => {
          await checkIns.save(session, answers)
          setLogVersion((v) => v + 1)
        },
        remove: async (session) => {
          await checkIns.remove(session)
          setLogVersion((v) => v + 1)
        },
      }
    : undefined
  const totals = trainingTotals(log ?? [], today)
  const bars = weeklyBars(log ?? [], today, plan)
  const week = plan?.weeks.find((w) => w.startDate <= today && today <= weekEnd(w)) ?? null
  const additionalIds = new Set(checkIns.entries.filter((c) => c.isAdditional && c.activityId).map((c) => c.activityId))
  const plannedActivityRuns = runs.filter((r) => !additionalIds.has(r.id))
  const completedActivityRuns = plannedActivityRuns.filter((r) => r.source.kind !== 'Strava' || checkIns.entries.some((c) => !c.isAdditional && c.activityId === r.id))
  const soFar = week ? weekSoFar(week, plannedActivityRuns, runsByDate(plannedActivityRuns)) : null
  if (soFar && week) {
    soFar.ranKm = ranKmByWeek([week], runs, today, checkIns.entries).get(week.number) ?? 0
    soFar.doneRuns = week.sessions.filter((s) => s.type !== 'Race' && s.type !== 'Strength' && (checkIns.get(s) ? checkIns.get(s)!.status !== 'Skipped' : completedActivityRuns.some((r) => r.localDate === s.date))).length
  }
  const progress = plan ? planProgress(plan, today) : null
  const headline = (bests ?? []).filter((b) => HEADLINE_BESTS.some((d) => Math.abs(d - b.distanceMetres) < 0.5))
  const goalSeconds = plan ? parseTimeSpan(plan.goalTime) : null
  const pendingSyncedRuns = runs.filter(r => r.source.kind === 'Strava' && r.localDate <= today && !checkIns.entries.some(c => c.activityId === r.id || c.date === r.localDate && !c.activityId && c.status !== 'Skipped'))
  const fromStrava = runs.some((r) => r.source.kind === 'Strava')
  const ranDates = new Set([...completedActivityRuns.filter((r) => r.kind !== 'Other').map((r) => r.localDate), ...checkIns.entries.filter((c) => !c.isAdditional && c.status !== 'Skipped').map((c) => c.date)])

  const showTab = (next: HomeTab, focus = false) => {
    if (next === tab) return
    if (next === 'tools') setToolsOpened(true)
    setTabDirection(HOME_TABS.findIndex((item) => item.id === next) > HOME_TABS.findIndex((item) => item.id === tab) ? 'forward' : 'back')
    setTab(next)
    tabToUrl(next)
    if (focus) tabRefs.current[HOME_TABS.findIndex((t) => t.id === next)]?.focus()
  }

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    touchStart.current = touch && event.touches.length === 1 && allowsSwipe(event.target) ? { x: touch.clientX, y: touch.clientY } : null
  }

  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    const direction = horizontalSwipe(start, { x: touch.clientX, y: touch.clientY })
    const next = HOME_TABS.findIndex((item) => item.id === tab) + direction
    if (direction && next >= 0 && next < HOME_TABS.length) showTab(HOME_TABS[next]!.id)
  }

  // Arrow keys move between tabs, as screen-reader users expect from a tab list, like the plan's own tabs.
  const onTabKey = (event: KeyboardEvent) => {
    const index = HOME_TABS.findIndex((t) => t.id === tab)
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: HOME_TABS.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    showTab(HOME_TABS[(moves[event.key]! + HOME_TABS.length) % HOME_TABS.length]!.id, true)
  }

  const panel = (id: HomeTab) => ({
    id: `home-panel-${id}`,
    role: 'tabpanel',
    'aria-labelledby': `home-tab-${id}`,
    hidden: tab !== id,
    className: `tab-panel home-panel${tab === id && tabDirection ? ` slide-${tabDirection}` : ''}`,
  })

  return (
    <div className="home">
      <div className="home-intro">
        <header className="home-hello">
          <Avatar name={runner.displayName} photo={photo} size={48} />
          <div>
            <h1 className="home-title">Welcome back, {runner.displayName}</h1>
            <p className="home-lede">
              {plan && progress && progress.daysToGo > 0
                ? `${progress.daysToGo} ${progress.daysToGo === 1 ? 'day' : 'days'} to ${plan.race.name}.`
                : plan && progress?.kind === 'race'
                  ? `It’s race day: ${plan.race.name}.`
                  : 'Every run counts. Here’s yours.'}
            </p>
          </div>
        </header>
      </div>

      <InstallCard />

      <div className="tabs home-tabs" role="tablist" aria-label="Home" onKeyDown={onTabKey}>
        {HOME_TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`home-tab-${t.id}`}
            className="tab"
            aria-selected={tab === t.id}
            aria-controls={`home-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => showTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div {...panel('today')} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchStart.current = null }}>
        {current && planFailed && <div className="home-data-state" role="alert"><p>{plan ? 'Your plan couldn’t refresh. Showing the last plan loaded on this device.' : 'Your plan couldn’t load. You can try again.'}</p><button type="button" className="button" onClick={retryPlan}>Retry plan</button></div>}
        <TickCard plan={plan} today={today} coach={coach} runs={runs} />
        <div className="home-top">
          {current ? (
            <TodayCard plan={plan} failed={planFailed} today={today} units={units} runs={runs} coach={coach} onOpenPlan={onOpenPlan} />
          ) : (
            <section className="panel home-card" aria-labelledby="home-goal">
              <h2 id="home-goal" className="home-card-heading">
                Something to run towards?
              </h2>
              <p>{current === undefined ? 'Looking for your plan…' : 'Pick a race and a goal, and get a plan built around the days you can run.'}</p>
              {current === null && (
                <button type="button" className="button" onClick={onBuildPlan}>
                  Build my plan
                </button>
              )}
            </section>
          )}

          <section className="panel home-card home-week" aria-labelledby="home-week">
            <h2 id="home-week" className="home-card-heading">
              This week
            </h2>
            {soFar ? (
              <div className="home-week-body">
                <WeekRing ran={soFar.ranKm} planned={soFar.plannedKm} />
                <div>
                  <p className="home-tile-value">
                    <span className="mono">{formatDistance(soFar.ranKm, units)}</span>
                  </p>
                  <p className="field-help">
                    of {formatDistance(soFar.plannedKm, units)} planned · {soFar.doneRuns} of {soFar.plannedRuns} runs
                  </p>
                  {soFar.plannedKm > 0 && soFar.ranKm > soFar.plannedKm && (
                    <p className="field-help">{formatDistance(soFar.ranKm - soFar.plannedKm, units)} past the plan this week</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p className="home-tile-value">
                  <span className="mono">{formatDistance(bars.at(-1)?.km ?? 0, units)}</span>
                </p>
                <p className="field-help">Last week {formatDistance(bars.at(-2)?.km ?? 0, units)}</p>
              </>
            )}
            {week && <WeekRuns week={week} today={today} units={units} ranOn={(date) => ranDates.has(date)} />}
          </section>
        </div>
        {plan && progress && (
          <section className="home-race-card" aria-labelledby="home-race-name">
            <p className="home-card-heading">Your finish line</p>
            <h2 id="home-race-name">{plan.race.name}</h2>
            <RaceLine plan={plan} week={week} units={units} />
            <div className="home-countdown-row">
              <p className="home-countdown">
                {progress.daysToGo > 0 ? <><span className="mono">{progress.daysToGo}</span><span className="home-countdown-label">days to go</span></> : <span className="home-race-state">{progress.kind === 'race' ? 'It’s race day' : 'Race complete'}</span>}
              </p>
              <button type="button" className="home-race-open" aria-label="Open your training plan" onClick={onOpenPlan}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" /></svg></button>
            </div>
            <div className="home-race-track" aria-hidden="true"><span style={{ width: `${progress.fraction * 100}%` }} /></div>
          </section>
        )}
        {plan && week && progress?.kind !== 'race' && (
          <YourWeek plan={plan} week={week} coachNotes={coaching} today={today} units={units} runs={runs} checkInFor={checkIns.ready ? checkIns.get : undefined} />
        )}
        <StravaNudge strava={strava} onOpenAccount={onOpenAccount} />

        <section className="section home-section" aria-labelledby="home-training">
          <h2 id="home-training" className="home-heading">
            Your running
          </h2>
          {pendingSyncedRuns.length > 0 && <div className="callout"><p>Your Strava run has synced. Confirm how it fits your plan to add a saved training entry.</p>
            <ul>{pendingSyncedRuns.map(run => <li key={run.id}>{formatDate(run.localDate)} · {formatDistance(run.distanceKm, units)} from Strava{' '}
              {plan && coach && run.localDate >= plan.startDate && run.localDate <= plan.race.date ? <button type="button" className="link-button" onClick={() => setRequestedRun(run)}>Log this run</button> : <button type="button" className="link-button" onClick={() => onOpenRun(run.id)}>View run</button>}
            </li>)}</ul><p className="field-help">Synced details are temporary. Enter your own distance and time for lasting distance totals, or link the run to record completion without copying its metrics.</p></div>}
          {requestedRun && plan && coach && <RunLog key={requestedRun.id} plan={plan} coach={coach} runs={runs} initialRun={requestedRun} onClose={() => setRequestedRun(undefined)} showEntries={false} />}
          {logFailed ? (
            <div className="home-data-state" role="alert">
              <p>Your running totals couldn’t load. Try again when you’re ready.</p>
              <button type="button" className="button" onClick={() => setLogVersion((v) => v + 1)}>Retry running totals</button>
            </div>
          ) : log === null ? (
            <div className="skeleton-stack" role="status" aria-label="Loading running totals"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /></div>
          ) : (
            <>
              <div className="home-tiles">
                <Tile label="This month" value={totals.month.km === 0 && totals.month.unknownRuns ? '—' : amount(totals.month.km, units)} unit={units} sub={`${totals.month.runs} ${totals.month.runs === 1 ? 'run' : 'runs'}`}>
                  <ChangeLine
                    value={change(totals.month.km, totals.previousMonth.km)}
                    units={units}
                    against={`${formatDate(totals.previousMonth.from, 'dayMonth')}–${formatDate(totals.previousMonth.to, 'dayMonth')}`}
                  />
                </Tile>
                <Tile label="This year" value={totals.year.km === 0 && totals.year.unknownRuns ? '—' : amount(totals.year.km, units)} unit={units} sub={`${totals.year.runs} ${totals.year.runs === 1 ? 'run' : 'runs'}`} />
                <Tile label="Weekly average" value={amount(totals.weeklyAverageKm, units)} unit={units} sub="Last 4 full weeks">
                  <ChangeLine value={change(totals.weeklyAverageKm, totals.previousWeeklyAverageKm)} units={units} against="the 4 weeks before" />
                </Tile>
              </div>
              {log.length === 0 && pendingSyncedRuns.length === 0 && <div className="home-data-state"><p>Your first run starts the story. Upload a run or tick a completed session in your plan to build your totals.</p><button type="button" className="link-button" onClick={onOpenRuns}>Add your runs →</button></div>}
            </>
          )}
          <p className="field-help">
            Saved totals use your own distance entries, uploaded files and plain completed sessions at their prescribed distance.
            Runs logged without distance count as runs; their distance stays unrecorded. The weekly average excludes this week.
            {totals.month.unknownRuns ? ` ${totals.month.unknownRuns} runs this month have no saved distance and are excluded from kilometre totals.` : ''}
            {fromStrava && ' Linked Strava metrics stay in their temporary cache; they are not copied into your saved totals.'}
          </p>
        </section>

        <section className="section home-section home-history" aria-labelledby="home-weeks">
          <h2 id="home-weeks" className="home-heading">
            The last 12 weeks
          </h2>
          {log === null || logFailed ? <p className="field-help">Your history will appear when your running totals load.</p> : bars.some((bar) => bar.km > 0 || (bar.plannedKm ?? 0) > 0) ? <WeeklyChart bars={bars} units={units} averageKm={totals.weeklyAverageKm} /> : <p className="field-help">Each uploaded run and ticked session adds to this view. Your weekly pattern will take shape here.</p>}
        </section>

        <section className="section home-section home-records" aria-labelledby="home-bests">
          <h2 id="home-bests" className="home-heading">
            Personal bests
          </h2>
          {headline.length === 0 ? (
            <div className="home-data-state"><p className="field-help">Your fastest 5K, 10K, half and full show here, from any run, race or not.</p><button type="button" className="link-button" onClick={onOpenRuns}>View or upload runs →</button></div>
          ) : (
            <ul className="home-bests">
              {headline.map((best) => (
                <li key={best.distanceMetres} className="home-best">
                  <span className="home-best-name">{best.name}</span>
                  <span className="mono home-best-time">{formatDuration(best.seconds)}</span>
                  <span className="mono field-help">{formatPace(best.paceSecondsPerKm, units)}</span>
                  <button type="button" className="link-button field-help" onClick={() => onOpenRun(best.activityId)}>
                    {formatDate(best.localDate, 'dayMonth')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div {...panel('tools')} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchStart.current = null }}>
        {toolsOpened && (
          <ScreenRecovery>
          <Suspense fallback={<div className="panel skeleton-stack" role="status" aria-label="Loading running tools"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /></div>}>
            <Calculators
              units={units}
              maxHeartRate={runner.maxHeartRate}
              race={plan && goalSeconds ? { distanceKm: plan.race.distanceKm, goalSeconds } : null}
            />
          </Suspense>
          </ScreenRecovery>
        )}
      </div>
    </div>
  )
}
