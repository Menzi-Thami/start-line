import { ReadinessCheckIn } from './ReadinessCheckIn'
import { BeginnerHomeCard } from './BeginnerHomeCard'
import { MilestoneCards } from '../milestones/MilestoneCards'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { ScreenRecovery } from '../../app/ScreenRecovery'
import { api } from '../../lib/api-client'
import { formatDate, formatDistance, formatDuration, formatPace, parseTimeSpan, type Units } from '../../lib/format'
import { planProgress } from '../../lib/plan-day'
import { weekEnd } from '../../lib/plan-runs'
import { currentTraining } from '../account/useCurrentPlan'
import { CheckInLoadState } from '../coaching/CheckInLoadState'
import { PlanAdjustment } from '../coaching/PlanAdjustment'
import { RunLog } from '../coaching/RunLog'
import type { ActivitySummary } from '../../lib/types'
import { SavedRun } from '../coaching/SavedRun'
import { RunResult } from '../coaching/RunResult'
import { completedViaStrava } from '../coaching/strava-completion'
import { ProgressStory } from '../coaching/ProgressStory'
import { TrainingInsights } from '../coaching/TrainingInsights'
import { useCheckIns, type SessionCoach } from '../coaching/useCheckIns'
import { completionsKey, useSyncedCompletions } from '../coaching/useSyncedCompletions'
import { change, trainingTotals, weeklyBars, type Change } from './home-math'
import { YourWeek } from './YourWeek'
import { WeeklyChart } from './WeeklyChart'
import { isPostTrainingHome } from '../journey/journey-model'
import { useJourney } from '../journey/useJourney'
import type { HomeProps as Props } from './Home'
import { useHomePlan, useAllTime, useRunningLog } from './home-data'

const Calculators = lazy(() => import('./Calculators').then((module) => ({ default: module.Calculators })))
const HEADLINE_BESTS = [5000, 10000, 21097.5, 42195]

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

type HomeTab = 'today' | 'tools'

/** Existing tools links still open the calculator disclosure; old progress links open the focused Home. */
function tabFromUrl(): HomeTab {
  return new URLSearchParams(window.location.search).get('tab') === 'tools' ? 'tools' : 'today'
}

function tabToUrl(tab: HomeTab) {
  const params = new URLSearchParams(window.location.search)
  if (tab === 'today') params.delete('tab')
  else params.set('tab', tab)
  const query = params.toString()
  // Replaced, not pushed: tabs are one page, as on the plan, so Back leaves Home rather than stepping through them.
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
}

export function RunningDetails({
  runner,
  units,
  today,
  current: storedCurrent,
  runs = [],
  bests,
  onOpenPlan,
  onOpenJourney,
  journey: sharedJourney,
  onBuildPlan,
  onOpenBeginner,
  onOpenRun,
  onOpenRuns,
  initialPlan,
  onPlanLoaded,
  onBack,
  backLabel = '← Back to Home',
}: Props & { onBack: () => void; backLabel?: string }) {
  const auth = useAuth()
  const training = currentTraining(storedCurrent, today)
  const localJourney = useJourney(!sharedJourney)
  const journey = sharedJourney ?? localJourney
  const data = journey.state.kind === 'ready' ? journey.state.journey : null
  const afterTraining = isPostTrainingHome(data, training === undefined ? undefined : training?.id ?? null, today) || !!storedCurrent && !training
  const phasePending = !afterTraining && (training === undefined || training === null && journey.state.kind === 'loading')
  const current = afterTraining || phasePending ? null : training
  const [reviewOpen, setReviewOpen] = useState(() => new URLSearchParams(window.location.search).get('review') === '1')
  const reviewRef = useRef<HTMLDetailsElement>(null)
  const [toolsOpen, setToolsOpen] = useState(() => tabFromUrl() === 'tools')
  const [toolsOpened, setToolsOpened] = useState(toolsOpen)
  // Preserve the existing direct links without putting these sections on the Home overview.
  const [insightsOpen, setInsightsOpen] = useState(() => new URLSearchParams(window.location.search).get('tab') === 'insights')
  const [insightsVisited, setInsightsVisited] = useState(insightsOpen)
  const { plan, coaching, retry: retryPlan } = useHomePlan(current, initialPlan, onPlanLoaded)
  const checkIns = useCheckIns(current?.id ?? null)
  // Sessions a held Strava run completes, computed by the API on each read; asked for again as check-ins or runs change.
  const synced = useSyncedCompletions(current?.id ?? null, completionsKey(checkIns.entries, runs))
  useEffect(() => {
    if (plan && new URLSearchParams(window.location.search).get('review') === '1') reviewRef.current?.scrollIntoView?.({ block: 'start' })
  }, [plan])
  // A tick or check-in made here changes the totals, so they're fetched again after each.
  const [logVersion, setLogVersion] = useState(0)
  const [requestedRun, setRequestedRun] = useState<ActivitySummary | undefined>(undefined)
  const activitiesVersion = runs.map(run => `${run.id}|${run.localDate}|${run.distanceKm}|${run.kind}|${run.source.kind}|${run.source.cachedUntil ?? ''}`).sort().join(';')
  const { log, failed: logFailed } = useRunningLog(logVersion, activitiesVersion, runner.id, !phasePending)
  const coach: SessionCoach | undefined = checkIns.ready
    ? {
        today,
        units,
        get: checkIns.get,
        synced: synced.get,
        entries: checkIns.entries,
        adjustments: current ? {
          reviewRemaining: async () => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to review your week.'); return api.me.reviewRemainingWeek(token, current.id) },
                  applyRemaining: async (proposalToken) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your week.'); const result = await api.me.applyRemainingWeek(token, current.id, proposalToken); void result; retryPlan() },
                  review: async (recovery) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to review your training.'); return api.me.reviewCoaching(token, current.id, recovery) },
          apply: async (proposalToken, recovery) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your training.'); await api.me.applyCoaching(token, current.id, proposalToken, recovery); setLogVersion((v) => v + 1); retryPlan() },
          decline: async (proposalToken, recovery) => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to answer the review.'); await api.me.declineCoaching(token, current.id, proposalToken, recovery); setLogVersion((v) => v + 1) },
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
  const allTime = useAllTime(runner.id, !phasePending)
  const totals = trainingTotals(log ?? [], today)
  const bars = weeklyBars(log ?? [], today, plan)
  // Weeks in a row with a run, from the kept log. Shown from two weeks up, so it reads as a streak.
  const week = plan?.weeks.find((w) => w.startDate <= today && today <= weekEnd(w)) ?? null
  const progress = plan ? planProgress(plan, today) : null
  const headline = (bests ?? []).filter((b) => HEADLINE_BESTS.some((d) => Math.abs(d - b.distanceMetres) < 0.5))
  const goalSeconds = plan ? parseTimeSpan(plan.goalTime) : null
  const pendingSyncedRuns = runs.filter(run => run.source.kind === 'Strava' && !checkIns.entries.some(entry => entry.activityId === run.id))
  const recentEntries = checkIns.entries.filter(entry => entry.status !== 'Skipped').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
  const fromStrava = runs.some((r) => r.source.kind === 'Strava')

  return <section className="home home-library" aria-labelledby="running-library-title">
    <button type="button" className="link-button" onClick={onBack}>{backLabel}</button>
    {current && <CheckInLoadState {...checkIns} />}
    <h1 id="running-library-title" className="plan-title">Running details</h1>
        {afterTraining && <BeginnerHomeCard today={today} onOpenProgramme={onOpenBeginner ?? onBuildPlan} />}
        {reviewOpen && plan && week && progress?.kind !== 'race' && <details ref={reviewRef} className="disclosure home-review" open={reviewOpen} onToggle={event => setReviewOpen(event.currentTarget.open)}><summary>Weekly coaching review</summary><YourWeek plan={plan} week={week} coachNotes={coaching} today={today} units={units} runs={runs} checkInFor={checkIns.ready ? checkIns.get : undefined} syncedFor={coach ? (s) => completedViaStrava(s, coach) : undefined} />{coach?.adjustments && <PlanAdjustment current={plan} units={units} actions={coach.adjustments} />}</details>}
        {reviewOpen && !afterTraining && <ReadinessCheckIn today={today} onReview={plan && week && progress?.kind !== 'race' ? () => { setReviewOpen(true); requestAnimationFrame(() => reviewRef.current?.scrollIntoView?.({ block: 'start' })) } : undefined} />}

        <section className="section home-section" aria-labelledby="home-training">
          <h2 id="home-training" className="home-heading">
            Your running
          </h2>
        {pendingSyncedRuns.length > 0 && <details className="disclosure home-sync"><summary>{pendingSyncedRuns.length} synced {pendingSyncedRuns.length === 1 ? 'run' : 'runs'} · Add training feedback</summary><p>Your Strava run has synced and counts automatically in your running totals. Log it to say how it fits your plan.</p>
          <ul>{pendingSyncedRuns.map(run => <li key={run.id}>{formatDate(run.localDate)} · {formatDistance(run.distanceKm, units)} from Strava{' '}
            {plan && coach && run.localDate >= plan.startDate && run.localDate <= plan.race.date ? <button type="button" className="link-button" onClick={() => setRequestedRun(run)}>Log this run</button> : <button type="button" className="link-button" onClick={() => onOpenRun(run.id)}>View run</button>}
          </li>)}</ul><p className="field-help">Logging adds your effort and feedback to the plan. You do not need to enter the distance again for it to count here.</p></details>}
        {requestedRun && plan && coach && <RunLog key={requestedRun.id} plan={plan} coach={coach} runs={runs} initialRun={requestedRun} onClose={() => setRequestedRun(undefined)} showEntries={false} />}
          {coach && recentEntries.length > 0 && <section className="home-recent" aria-label="Recently logged runs">
            <h3>Recent activity</h3>
            {recentEntries.map(entry => <details className="activity-row" key={entry.id ?? `${entry.date}|${entry.sessionType}`}>
              <summary><span>{formatDate(entry.date)}</span><RunResult entry={entry} runs={runs} units={units} compact /></summary>
              <SavedRun entry={entry} coach={coach} runs={runs} onOpenRun={onOpenRun} />
            </details>)}
            <button type="button" className="link-button" onClick={onOpenPlan}>View runs in your plan →</button>
          </section>}
          <details className="disclosure home-insights" open={insightsOpen} onToggle={event => { setInsightsOpen(event.currentTarget.open); if (event.currentTarget.open) setInsightsVisited(true) }}><summary>Running insights <span className="field-help">Totals, trends & personal bests</span></summary>
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
                  {totals.month.stravaKm != null && <p className="field-help">{formatDistance(totals.month.stravaKm, units)} from Strava</p>}
                  {totals.month.unknownRuns || totals.previousMonth.unknownRuns ? <p className="field-help">Comparison unavailable while distances are missing.</p> : <ChangeLine
                    value={change(totals.month.km, totals.previousMonth.km)}
                    units={units}
                    against={`${formatDate(totals.previousMonth.from, 'dayMonth')}–${formatDate(totals.previousMonth.to, 'dayMonth')}`}
                  />}
                </Tile>
                <Tile label="This year" value={totals.year.km === 0 && totals.year.unknownRuns ? '—' : amount(totals.year.km, units)} unit={units} sub={`${totals.year.runs} ${totals.year.runs === 1 ? 'run' : 'runs'}`}>
                  {totals.year.stravaKm != null && <p className="field-help">{formatDistance(totals.year.stravaKm, units)} from Strava</p>}
                </Tile>
                <Tile label="Weekly average" value={totals.weeklyAverageKm === 0 && totals.weeklyUnknownRuns ? '—' : amount(totals.weeklyAverageKm, units)} unit={units} sub="Last 4 full weeks">
                  {totals.weeklyUnknownRuns || totals.previousWeeklyUnknownRuns ? <p className="field-help">Comparison unavailable while distances are missing.</p> : <ChangeLine value={change(totals.weeklyAverageKm, totals.previousWeeklyAverageKm)} units={units} against="the 4 weeks before" />}
                </Tile>
                {allTime && allTime.runs > 0 && (
                  <Tile label="All time" value={amount(allTime.km, units)} unit={units} sub={`${allTime.runs} ${allTime.runs === 1 ? 'run' : 'runs'}${allTime.since ? ` since ${formatDate(allTime.since, 'dayMonth')} ${allTime.since.slice(0, 4)}` : ''}`} />
                )}
              </div>
              {log.length === 0 && pendingSyncedRuns.length === 0 && <div className="home-data-state">
                <p>{afterTraining ? 'No running totals are available in this view. Your saved training chapters and race results are in Journey.' : 'Your first run starts the story. Upload a run or tick a completed session in your plan to build your totals.'}</p>
                {afterTraining && onOpenJourney ? <button type="button" className="link-button" onClick={() => onOpenJourney()}>View my journey</button> : <button type="button" className="link-button" onClick={onOpenRuns}>Add your runs →</button>}
              </div>}
            </>
          )}
          <details className="home-totals-note"><summary>About your totals</summary><p className="field-help">
            Totals include your saved running history and available Strava runs automatically, counting each associated run once.
            The weekly average excludes this week.
            {totals.month.unknownRuns ? ` ${totals.month.unknownRuns} ${totals.month.unknownRuns === 1 ? 'run has' : 'runs have'} no available distance and ${totals.month.unknownRuns === 1 ? 'is' : 'are'} excluded from kilometre totals.` : ''}
            {(fromStrava || log?.some(run => run.source === 'Strava')) && ' Strava contributions update with your connection and are removed if the imported run is deleted or no longer available. Your own saved distances remain.'}
          </p>
          </details>

          {insightsVisited && <>
          {runs.length > 0 && <section aria-label="Share a milestone"><h3>Share a milestone</h3><MilestoneCards runs={runs} /></section>}
        {current && (
          <section className="section home-section home-trends" aria-labelledby="home-trends">
            <h2 id="home-trends" className="home-heading">
              Your training trends
            </h2>
            <TrainingInsights
              planId={current.id}
              units={units}
              refreshKey={`${logVersion}|${activitiesVersion}`}
              onReview={plan && week && progress?.kind !== 'race' ? () => { setReviewOpen(true); requestAnimationFrame(() => reviewRef.current?.scrollIntoView?.({ block: 'start' })) } : undefined}
            />
          </section>
        )}
        {current && (
          <section className="section home-section home-progress" aria-labelledby="home-progress">
            <h2 id="home-progress" className="home-heading">
              Your progress
            </h2>
            <ProgressStory planId={current.id} units={units} refreshKey={`${logVersion}|${activitiesVersion}`} />
          </section>
        )}
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
          </>}
          </details>
        </section>

      <details className="disclosure home-tools" open={toolsOpen} onToggle={event => {
        const open = event.currentTarget.open
        setToolsOpen(open)
        if (open) setToolsOpened(true)
        tabToUrl(open ? 'tools' : 'today')
      }}><summary>Running tools <span className="field-help">Pace, race time & heart rate</span></summary>
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
      </details>

  </section>
}
