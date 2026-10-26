import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, parseTimeSpan, type Units } from '../../lib/format'
import { planProgress } from '../../lib/plan-day'
import { runsByDate, weekEnd } from '../../lib/plan-runs'
import type { ActivitySummary, CoachNote, PersonalBest, PlanWeek, Runner, Session, StravaStatus, TrainingPlan } from '../../lib/types'
import type { CurrentPlan } from '../account/useCurrentPlan'
import { useCheckIns } from '../coaching/useCheckIns'
import { weekSoFar } from '../dashboard/dashboard-math'
import { InstallCard } from '../install/InstallApp'
import { SessionSteps } from '../plan/SessionSteps'
import { Runner as RunnerFigure } from '../shared/Runner'
import { Calculators } from './Calculators'
import { change, todayInPlan, trainingTotals, weeklyBars, type Change, type WeekBar } from './home-math'
import { YourWeek } from './YourWeek'

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
  onOpenAccount: () => void
  /** The plan as last seen on this device, shown until this visit's has loaded. */
  initialPlan?: HomePlan | null
  /** This visit's plan, once it has loaded, so the device can keep a copy. */
  onPlanLoaded?: (plan: HomePlan) => void
  /** When Home is showing the copy kept on this device while the account loads: when that copy was saved. */
  catchingUpFrom?: string | null
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
): { plan: TrainingPlan | null; coaching: CoachNote[] } {
  const auth = useAuth()
  const [plan, setPlan] = useState<HomePlan | null>(null)
  const [coaching, setCoaching] = useState<{ id: string; notes: CoachNote[] } | null>(null)
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
        if (cancelled || !saved) return
        const found = { id: current.id, plan: saved.plan }
        setPlan(found)
        setCoaching({ id: current.id, notes: saved.coaching ?? [] })
        loaded.current?.(found)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [current, auth])
  // Until this visit's plan arrives, the copy from last time (if it's the same plan) stands in for it.
  const shown = plan && current && plan.id === current.id ? plan : initial
  return {
    plan: shown && current && shown.id === current.id ? shown.plan : null,
    coaching: coaching && current && coaching.id === current.id ? coaching.notes : [],
  }
}

const clock = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit' })

/** "from 9:14", or "from Tuesday" when the copy is from another day. */
function savedWhen(savedAt: string, today: string): string {
  const saved = new Date(savedAt)
  const sameDay = saved.toLocaleDateString('en-CA') === today
  return sameDay ? `from ${clock.format(saved)}` : `from ${saved.toLocaleDateString('en-GB', { weekday: 'long' })}`
}

/** A quiet line while a page shows the copy kept on this device, so it's clear what's on screen and that it's catching up. */
export function CatchingUp({ what, savedAt, today }: { what: string; savedAt: string; today: string }) {
  return (
    <p className="home-catching-up" role="status">
      <span className="wait-spinner" aria-hidden="true" />
      Showing your {what} {savedWhen(savedAt, today)} while Taperday catches up.
    </p>
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

const hoursAndMinutes = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

/** This week as a ring: distance run against the plan's distance. Purely a picture; the words beside it say the same. */
function WeekRing({ ran, planned }: { ran: number; planned: number }) {
  const r = 42
  const circumference = 2 * Math.PI * r
  const fraction = planned > 0 ? Math.min(1, ran / planned) : 0
  return (
    <svg className="home-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} className="home-ring-track" />
      <circle
        cx="50"
        cy="50"
        r={r}
        className="home-ring-fill"
        strokeDasharray={`${fraction * circumference} ${circumference}`}
        transform="rotate(-90 50 50)"
      />
    </svg>
  )
}

/**
 * Today's session from the runner's plan. The card and its button stay put while the plan loads, so a tap on "Open your
 * plan" always lands, however quickly it comes.
 */
function TodayCard({ plan, today, units, runs, onOpenPlan }: { plan: TrainingPlan | null; today: string; units: Units; runs: ActivitySummary[]; onOpenPlan: () => void }) {
  return (
    <section className="panel home-card home-today" aria-labelledby="home-today">
      <h2 id="home-today" className="home-card-heading">
        Today
      </h2>
      {plan ? <TodaysRuns plan={plan} today={today} units={units} runs={runs} /> : <p className="field-help">Getting today’s session…</p>}
      <button type="button" className="button" onClick={onOpenPlan}>
        Open your plan
      </button>
    </section>
  )
}

function TodaysRuns({ plan, today, units, runs }: { plan: TrainingPlan; today: string; units: Units; runs: ActivitySummary[] }) {
  const progress = planProgress(plan, today)
  const day = todayInPlan(plan, today)
  const byZone = new Map(plan.paces.map((p) => [p.zone, p]))
  const pace = (s: Session) => {
    const zone = s.zone ? byZone.get(s.zone) : undefined
    return zone ? formatPaceRange(zone.fastestSecondsPerKm, zone.slowestSecondsPerKm, units) : null
  }
  const doneToday = runs.some((r) => r.localDate === today && r.kind !== 'Other')

  const body = (() => {
    if (progress.kind === 'before') return <p>Your plan starts {formatDate(plan.startDate, 'long')}. Easy running until then.</p>
    if (progress.kind === 'race') return <p className="home-today-title">Race day. Everything you’ve run was for this. Go and enjoy it.</p>
    if (progress.kind === 'after') return <p>Race done. Time to rest, then pick the next one.</p>
    if (day.runs.length === 0) {
      return (
        <>
          <p className="home-today-title">Rest day</p>
          <p>Legs up. Rest is when the training turns into fitness.</p>
          {day.next && (
            <p className="field-help">
              Next: {day.next.title}, {formatDate(day.next.date)}
              {day.next.distanceKm > 0 ? ` · ${formatDistance(day.next.distanceKm, units)}` : ''}
            </p>
          )}
        </>
      )
    }
    return day.runs.map((s) => (
      <div key={`${s.date}|${s.type}`} className="home-today-run">
        <p className="home-today-title">
          {s.title}
          {doneToday && <span className="chip chip-good">Done</span>}
        </p>
        <p className="mono home-today-meta">
          {s.distanceKm > 0 ? formatDistance(s.distanceKm, units) : ''}
          {pace(s) ? ` · ${pace(s)}` : ''}
        </p>
        <p className="field-help">{s.detail}</p>
        <SessionSteps steps={s.steps} units={units} />
        <p className="home-today-why">Why: {s.purpose}</p>
      </div>
    ))
  })()

  return (
    <>
      {body}
      {day.strength.length > 0 && <p className="field-help">Plus {day.strength[0]!.title.toLowerCase()}.</p>}
    </>
  )
}

/** The last twelve weeks, run against planned, as bars; a table carries the numbers for screen readers. */
function WeeklyChart({ bars, units, averageKm }: { bars: WeekBar[]; units: Units; averageKm: number }) {
  const max = Math.max(10, ...bars.map((b) => Math.max(b.km, b.plannedKm ?? 0)))
  const share = (km: number) => `${(km / max) * 100}%`
  return (
    <figure className="home-chart">
      <div className="home-bars" aria-hidden="true">
        {bars.map((bar, i) => (
          <div key={bar.weekStart} className={`home-bar${i === bars.length - 1 ? ' home-bar-now' : ''}`}>
            {bar.plannedKm != null && <span className="home-bar-planned" style={{ height: share(bar.plannedKm) }} />}
            <span className="home-bar-ran" style={{ height: share(bar.km) }} />
          </div>
        ))}
        {averageKm > 0 && <span className="home-chart-average" style={{ bottom: share(averageKm) }} />}
      </div>
      <div className="home-bar-labels" aria-hidden="true">
        {bars.map((bar, i) => (
          <span key={bar.weekStart}>{(bars.length - 1 - i) % 3 === 0 ? formatDate(bar.weekStart, 'dayMonth') : ''}</span>
        ))}
      </div>
      <figcaption className="field-help">
        Bars: ran. Outline: planned. Line: 4-week average.
      </figcaption>
      <table className="visually-hidden">
        <caption>Weekly distance, last 12 weeks</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Ran</th>
            <th scope="col">Planned</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.weekStart}>
              <td>{formatDate(bar.weekStart, 'dayMonth')}</td>
              <td>{formatDistance(bar.km, units)}</td>
              <td>{bar.plannedKm == null ? '–' : formatDistance(bar.plannedKm, units)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
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
  onOpenAccount,
  initialPlan,
  onPlanLoaded,
  catchingUpFrom,
}: Props) {
  const [tab, setTab] = useState<HomeTab>(tabFromUrl)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const { plan, coaching } = useHomePlan(current, initialPlan, onPlanLoaded)
  const checkIns = useCheckIns(current?.id ?? null)
  const totals = trainingTotals(runs, today)
  const bars = weeklyBars(runs, today, plan)
  const week = plan?.weeks.find((w) => w.startDate <= today && today <= weekEnd(w)) ?? null
  const soFar = week ? weekSoFar(week, runs, runsByDate(runs)) : null
  const progress = plan ? planProgress(plan, today) : null
  const headline = (bests ?? []).filter((b) => HEADLINE_BESTS.some((d) => Math.abs(d - b.distanceMetres) < 0.5))
  const goalSeconds = plan ? parseTimeSpan(plan.goalTime) : null
  const fromStrava = runs.some((r) => r.source.kind === 'Strava')
  const ranDates = new Set(runs.filter((r) => r.kind !== 'Other').map((r) => r.localDate))

  const showTab = (next: HomeTab, focus = false) => {
    setTab(next)
    tabToUrl(next)
    if (focus) tabRefs.current[HOME_TABS.findIndex((t) => t.id === next)]?.focus()
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
    className: 'tab-panel home-panel',
  })

  return (
    <div className="home">
      <header className="home-hello">
        <RunnerFigure pose="sprint" size={40} className="home-hello-runner" />
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

      {catchingUpFrom && <CatchingUp what="page" savedAt={catchingUpFrom} today={today} />}

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

      <div {...panel('today')}>
        <div className="home-top">
          {current ? (
            <TodayCard plan={plan} today={today} units={units} runs={runs} onOpenPlan={onOpenPlan} />
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
        {plan && week && progress?.kind !== 'race' && (
          <YourWeek plan={plan} week={week} coachNotes={coaching} today={today} units={units} runs={runs} checkInFor={checkIns.ready ? checkIns.get : undefined} />
        )}
        <StravaNudge strava={strava} onOpenAccount={onOpenAccount} />
        <InstallCard />

        <section className="section home-section" aria-labelledby="home-training">
          <h2 id="home-training" className="home-heading">
            Your running
          </h2>
          <div className="home-tiles">
            <Tile label="This month" value={amount(totals.month.km, units)} unit={units} sub={`${totals.month.runs} runs · ${hoursAndMinutes(totals.month.seconds)}`}>
              <ChangeLine
                value={change(totals.month.km, totals.previousMonth.km)}
                units={units}
                against={`${formatDate(totals.previousMonth.from, 'dayMonth')}–${formatDate(totals.previousMonth.to, 'dayMonth')}`}
              />
            </Tile>
            <Tile label="This year" value={amount(totals.year.km, units)} unit={units} sub={`${totals.year.runs} runs · ${hoursAndMinutes(totals.year.seconds)}`} />
            <Tile label="Weekly average" value={amount(totals.weeklyAverageKm, units)} unit={units} sub="Last 4 full weeks">
              <ChangeLine value={change(totals.weeklyAverageKm, totals.previousWeeklyAverageKm)} units={units} against="the 4 weeks before" />
            </Tile>
          </div>
          {fromStrava && (
            <p className="field-help">Runs from Strava stay on Taperday for 7 days, as Strava asks, so these totals count uploads and this week’s Strava runs.</p>
          )}
        </section>

        <section className="section home-section" aria-labelledby="home-weeks">
          <h2 id="home-weeks" className="home-heading">
            The last 12 weeks
          </h2>
          <WeeklyChart bars={bars} units={units} averageKm={totals.weeklyAverageKm} />
        </section>

        <section className="section home-section" aria-labelledby="home-bests">
          <h2 id="home-bests" className="home-heading">
            Personal bests
          </h2>
          {headline.length === 0 ? (
            <p className="field-help">Your fastest 5K, 10K, half and full show here, from any run, race or not.</p>
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

      <div {...panel('tools')}>
        <Calculators
          units={units}
          maxHeartRate={runner.maxHeartRate}
          race={plan && goalSeconds ? { distanceKm: plan.race.distanceKm, goalSeconds } : null}
        />
      </div>
    </div>
  )
}
