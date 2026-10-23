import { useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, parseTimeSpan, type Units } from '../../lib/format'
import { planProgress } from '../../lib/plan-day'
import { runsByDate, weekEnd } from '../../lib/plan-runs'
import type { ActivitySummary, PersonalBest, Runner, Session, StravaStatus, TrainingPlan } from '../../lib/types'
import type { CurrentPlan } from '../account/useCurrentPlan'
import { weekSoFar } from '../dashboard/dashboard-math'
import { Runner as RunnerFigure } from '../shared/Runner'
import { Calculators } from './Calculators'
import { change, todayInPlan, trainingTotals, weeklyBars, type Change, type WeekBar } from './home-math'

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
  onOpenRuns: () => void
  onOpenRun: (id: string) => void
  onOpenAccount: () => void
}

/** The race distances worth a place on Home; the plan's Overview and the run pages list the rest. */
const HEADLINE_BESTS = [5000, 10000, 21097.5, 42195]

/** The runner's plan, as the coach has it this week. Without it Home still shows their running. */
function useHomePlan(current: CurrentPlan | null | undefined): TrainingPlan | null {
  const auth = useAuth()
  const [plan, setPlan] = useState<{ id: string; plan: TrainingPlan } | null>(null)
  useEffect(() => {
    if (!current) return
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.coachPlan(token, current.id) : null))
      .then((saved) => !cancelled && saved && setPlan({ id: current.id, plan: saved.plan }))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [current, auth])
  return plan && current && plan.id === current.id ? plan.plan : null
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
        Bars are what you ran; the outline behind is what your plan asked for. The line is your 4-week average.
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

function Connections({ strava, onOpenAccount, onOpenRuns }: { strava?: StravaStatus; onOpenAccount: () => void; onOpenRuns: () => void }) {
  const stravaLine = strava?.connected
    ? strava.status === 'NeedsReconnect'
      ? 'Stopped sending runs. Connect again.'
      : 'Connected. Runs arrive by themselves.'
    : strava?.available
      ? 'Not connected yet.'
      : 'Not available right now.'
  return (
    <section className="section home-section" aria-labelledby="home-connections">
      <h2 id="home-connections" className="home-heading">
        Your runs, from anywhere
      </h2>
      <ul className="home-connections">
        <li className="home-connection">
          <span className="home-connection-name">Strava</span>
          <span className="field-help">{stravaLine}</span>
          {strava?.available && (!strava.connected || strava.status === 'NeedsReconnect') && (
            <button type="button" className="link-button" onClick={onOpenAccount}>
              Connect Strava
            </button>
          )}
        </li>
        <li className="home-connection">
          <span className="home-connection-name">Any watch</span>
          <span className="field-help">Upload a .fit, .gpx or .tcx file: Garmin, Coros, Polar, Suunto and more.</span>
          <button type="button" className="link-button" onClick={onOpenRuns}>
            Upload a run
          </button>
        </li>
        <li className="home-connection home-connection-soon">
          <span className="home-connection-name">Garmin Connect</span>
          <span className="field-help">Coming. Until then, upload your .fit files from Garmin Connect.</span>
        </li>
        <li className="home-connection home-connection-soon">
          <span className="home-connection-name">Apple Health · Health Connect</span>
          <span className="field-help">Coming with the Taperday phone app: a website can’t read them.</span>
        </li>
      </ul>
    </section>
  )
}

/**
 * Home for a signed-in runner: what's on today, how the week is going, their running over the months, their bests, and
 * the calculators. Built from their own runs, so it's useful with or without a plan. A plan adds today's session, this
 * week's ring and the planned distance behind each week's bar.
 */
export function Home({ runner, units, today, current, runs = [], bests, strava, onOpenPlan, onBuildPlan, onOpenRuns, onOpenRun, onOpenAccount }: Props) {
  const plan = useHomePlan(current)
  const totals = trainingTotals(runs, today)
  const bars = weeklyBars(runs, today, plan)
  const week = plan?.weeks.find((w) => w.startDate <= today && today <= weekEnd(w)) ?? null
  const soFar = week ? weekSoFar(week, runs, runsByDate(runs)) : null
  const progress = plan ? planProgress(plan, today) : null
  const headline = (bests ?? []).filter((b) => HEADLINE_BESTS.some((d) => Math.abs(d - b.distanceMetres) < 0.5))
  const goalSeconds = plan ? parseTimeSpan(plan.goalTime) : null
  const fromStrava = runs.some((r) => r.source.kind === 'Strava')

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
        </section>
      </div>

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

      <Calculators
        units={units}
        maxHeartRate={runner.maxHeartRate}
        race={plan && goalSeconds ? { distanceKm: plan.race.distanceKm, goalSeconds } : null}
      />

      <Connections strava={strava} onOpenAccount={onOpenAccount} onOpenRuns={onOpenRuns} />
    </div>
  )
}
