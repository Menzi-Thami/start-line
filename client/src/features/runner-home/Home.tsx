import { useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { formatDate, type Units } from '../../lib/format'
import type { ActivitySummary, PersonalBest, Runner, StravaStatus } from '../../lib/types'
import { Avatar } from '../account/Avatar'
import { currentTraining, type CurrentPlan } from '../account/useCurrentPlan'
import { CheckInLoadState } from '../coaching/CheckInLoadState'
import { useCheckIns, type SessionCoach } from '../coaching/useCheckIns'
import { completionsKey, useSyncedCompletions } from '../coaching/useSyncedCompletions'
import { JourneyHomeCard } from '../journey/JourneyHomeCard'
import { syncedFor } from '../coaching/strava-completion'
import { formatDistance } from '../../lib/format'
import { recordingForToday } from './today-recording'
import { isPostTrainingHome } from '../journey/journey-model'
import { useJourney } from '../journey/useJourney'
import { weekEnd } from '../../lib/plan-runs'
import { NotificationTick } from './NotificationTick'
import { BeginnerHomeCard } from './BeginnerHomeCard'
import { LatestRun } from './LatestRun'
import { TodayFocus } from './TodayFocus'
import { useHomePlan, useAvailableRecordings, type HomePlan } from './home-data'
import './home-navigation.css'

export interface HomeProps {
  runner: Runner; units: Units; today: string; current: CurrentPlan | null | undefined
  runs?: ActivitySummary[]; bests?: PersonalBest[]; strava?: StravaStatus
  onOpenPlan: () => void; onOpenJourney?: (planId?: string) => void; onOpenRecovery?: (raceId?: string) => void
  journey?: ReturnType<typeof useJourney>; onOpenRacePrep?: () => void; onOpenDay?: (date: string) => void
  onBuildPlan: () => void; onOpenBeginner?: () => void; onOpenRun: (id: string) => void
  onOpenRuns: () => void; onOpenAccount: () => void; initialPlan?: HomePlan | null
  onPlanLoaded?: (plan: HomePlan) => void; photo?: string | null; accountLoading?: boolean
  currentPlanFailed?: boolean; onRetryCurrentPlan?: () => void
  /** The current plan's id, known from the plan list before the plan itself arrives. */
  pendingPlanId?: string | null
}
/** One priority on Home. Running totals and tools live on Runs; progress and the weekly review live on the plan. */
export function Home(props: HomeProps) {
  const { runner, units, today, current: stored, runs = [], strava, onOpenPlan, onBuildPlan, onOpenRun, onOpenRuns,
    initialPlan, onPlanLoaded, photo = null, accountLoading = false } = props
  const available = useAvailableRecordings(runs)
  const heading = useRef<HTMLHeadingElement>(null)
  const [beginnerActive, setBeginnerActive] = useState(false)
  const localJourney = useJourney(!props.journey)
  const journey = props.journey ?? localJourney
  const data = journey.state.kind === 'ready' ? journey.state.journey : null
  const current = currentTraining(stored, today)
  const afterTraining = isPostTrainingHome(data, current === undefined ? undefined : current?.id ?? null, today) || !!stored && !current || !!current && !!data?.chapters.find(chapter => chapter.planId === current.id)?.raceResult
  const pending = current === undefined || current === null && journey.state.kind === 'loading'
  const { plan, failed, retry } = useHomePlan(afterTraining ? null : current, initialPlan, onPlanLoaded, props.pendingPlanId)
  // The plan list already names the plan, so its check-ins and Strava completions load alongside its details.
  // Reads only: anything that changes the plan still waits for the confirmed plan (planId below).
  const readPlanId = afterTraining ? null : current?.id ?? (current === undefined ? props.pendingPlanId ?? null : null)
  const checkIns = useCheckIns(readPlanId)
  const synced = useSyncedCompletions(readPlanId, completionsKey(checkIns.entries, available))
  const auth = useAuth()
  const planId = afterTraining ? null : current?.id ?? null
  const signedIn = async () => { const token = await auth.getToken(); if (!token) throw new Error('Sign in again to update your week.'); return token }
  // What the coach makes of a rating made here: the same rules-only check of the week as on the plan, and its Undo.
  const adjustments: SessionCoach['adjustments'] = planId ? {
    review: async recovery => api.me.reviewCoaching(await signedIn(), planId, recovery),
    apply: async (token, recovery) => { await api.me.applyCoaching(await signedIn(), planId, token, recovery); retry() },
    reviewRemaining: async reported => api.me.reviewRemainingWeek(await signedIn(), planId, reported),
    applyRemaining: async (token, reported) => { await api.me.applyRemainingWeek(await signedIn(), planId, token, reported); retry() },
    life: {
      preview: async change => api.me.previewLifeChange(await signedIn(), planId, change),
      apply: async (change, token) => { await api.me.applyLifeChange(await signedIn(), planId, change, token); retry() },
      restore: async dates => { await api.me.restoreSessions(await signedIn(), planId, dates); retry() },
    },
  } : undefined
  const coach: SessionCoach | undefined = checkIns.ready ? {
    today, units, get: checkIns.get, synced: synced.get, entries: checkIns.entries, adjustments,
    pendingFor: session => checkIns.pending.some(item => item.key === `${session.date}|${session.type}`),
    save: checkIns.save, remove: checkIns.remove, saveAdditional: checkIns.saveAdditional, removeAdditional: checkIns.removeAdditional,
  } : undefined
  const week = plan?.weeks.find(value => value.startDate <= today && today <= weekEnd(value))
  const weekRuns = week?.sessions.filter(session => session.type !== 'Strength' && session.type !== 'Race') ?? []
  const doneRuns = weekRuns.filter(session => { const own = coach?.get(session); return own ? own.status !== 'Skipped' : syncedFor(session, coach)?.state === 'Completed' || !!recordingForToday(session, coach, available) }).length
  return <div className={`home home-simple${afterTraining ? ' is-after-training' : ''}`}>
    <div>
      <header className="home-hello"><Avatar name={runner.displayName} photo={photo} size={48} /><div>
        <h1 ref={heading} tabIndex={-1} className="home-title">Welcome back, {runner.displayName}</h1><p className="home-lede">{formatDate(today, 'long')}</p>
      </div></header>
      <div className="home-panel home-focus" id="home-panel-today">
        {props.currentPlanFailed && <section className="home-data-state" role="alert"><h2 className="home-card-heading">Your current plan</h2><p>We couldn’t check your saved plan. Try again to pick up where you left off.</p><button type="button" className="button button-quiet" onClick={props.onRetryCurrentPlan}>Retry current plan</button></section>}
        {!props.currentPlanFailed && !accountLoading && pending && <section className="panel home-card" role="status" aria-label="Loading your current chapter"><h2 className="home-card-heading">Your day</h2><p>Finding your current chapter…</p></section>}
        {!pending && journey.state.kind === 'error' && !current && <section className="panel home-card" role="alert"><h2 className="home-card-heading">Your saved chapter</h2><p>{journey.state.message}</p><button type="button" className="button" onClick={journey.actions.refresh}>Try again</button></section>}
        {current && (checkIns.failed || checkIns.offline || !!checkIns.pending?.length) && <CheckInLoadState {...checkIns} />}
        {current && failed && <div className="home-data-state" role="alert"><p>{plan ? 'Your plan couldn’t refresh. Showing the last plan loaded on this device.' : 'Your plan couldn’t load. You can try again.'}</p><button type="button" className="button" onClick={retry}>Retry plan</button></div>}
        {!pending && !beginnerActive && (afterTraining || current === null) && <JourneyHomeCard journey={journey} today={today} currentPlanId={null} onOpenPlan={onOpenPlan} onOpenJourney={props.onOpenJourney} onOpenRecovery={props.onOpenRecovery} onNewRace={onBuildPlan} />}
        {!pending && !afterTraining && !current && <BeginnerHomeCard today={today} primary onAvailable={setBeginnerActive} onOpenProgramme={props.onOpenBeginner ?? onBuildPlan} />}
        {!pending && !afterTraining && current && <TodayFocus plan={plan} failed={failed} today={today} units={units} runs={available} coach={coach} onOpenPlan={onOpenPlan} onOpenDay={props.onOpenDay} onOpenRacePrep={props.onOpenRacePrep} onOpenRun={onOpenRun} />}
        {!pending && !afterTraining && current && plan && week && plan.race.date !== today && <section className="home-week-preview" aria-label="This week">
          <div><h2 className="home-card-heading">Your week</h2><p className="field-help">Week {week.number} of {plan.weeks.length} · {plan.race.name}</p><p className="field-help">{formatDistance(plan.race.distanceKm, units)} · {formatDate(plan.race.date)} · {week.phase}</p><p className="field-help">{doneRuns} of {weekRuns.length} runs</p></div>
          <button type="button" className="link-button" onClick={onOpenPlan}>View this week</button>
        </section>}
        {!pending && !afterTraining && plan && coach && <NotificationTick plan={plan} today={today} coach={coach} />}
        {!pending && <LatestRun runs={available} strava={strava} units={units} today={today} onOpenRun={onOpenRun} onOpenRuns={onOpenRuns} />}
        {!pending && strava?.status === 'NeedsReconnect' && <p className="field-help home-connection-note">Your Strava connection needs attention. <button type="button" className="link-button" onClick={props.onOpenAccount}>Reconnect Strava</button></p>}
      </div>
    </div>
  </div>
}
