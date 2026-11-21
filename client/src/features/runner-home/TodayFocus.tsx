import { useState } from 'react'
import { formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, type Units } from '../../lib/format'
import { planProgress } from '../../lib/plan-day'
import type { ActivitySummary, TrainingPlan } from '../../lib/types'
import { StravaCompletion } from '../coaching/StravaCompletion'
import { completedViaStrava } from '../coaching/strava-completion'
import { RunResult } from '../coaching/RunResult'
import { CheckInCard } from '../coaching/CheckInCard'
import { PostRunRating } from '../coaching/PostRunRating'
import { dismissRating, ratingWasDismissed } from '../coaching/rating-dismissal'
import type { SessionCoach } from '../coaching/useCheckIns'
import { recordingForToday } from './today-recording'
import { Runner } from '../shared/Runner'
import { todayInPlan } from './home-math'

// "Not now" on the tick prompt lasts for the day it was said, on this device only.
const dismissedKey = (date: string) => `taperday.tick-prompt.dismissed.${date}`
const wasDismissed = (date: string) => {
  try { return localStorage.getItem(dismissedKey(date)) !== null } catch { return false }
}
const dismiss = (date: string) => {
  try { localStorage.setItem(dismissedKey(date), '1') } catch { /* private mode: it just shows again */ }
}

export function TodayFocus({ plan, failed, today, units, runs, coach, onOpenPlan, onOpenDay, onOpenRacePrep, onOpenRun }: {
  plan: TrainingPlan | null; failed: boolean; today: string; units: Units; runs: ActivitySummary[]; coach?: SessionCoach
  onOpenPlan: () => void; onOpenDay?: (date: string) => void; onOpenRacePrep?: () => void; onOpenRun: (id: string) => void
}) {
  const [logging, setLogging] = useState(false)
  const [dismissedOn, setDismissedOn] = useState<string | null>(null)
  // A dismissal belongs to one day; crossing midnight must never suppress the next run's prompt.
  const dismissed = dismissedOn === today || wasDismissed(today)
  // Once offered, the rating stays put for this visit: saving it shows the answer ("Rated 4/10 · As planned") in place,
  // with Edit feedback and what the coach makes of it, instead of the card disappearing the moment the answer exists.
  const [offered, setOffered] = useState(false)
  const progress = plan ? planProgress(plan, today) : null
  const day = plan ? todayInPlan(plan, today) : null
  const session = day?.runs[0]
  const own = session ? coach?.get(session) : undefined
  // A held Strava run did today's session and the runner hasn't ticked it: offer the one tap that makes it theirs. Optional,
  // and it keeps only the runner's own Done, never Strava's figures (docs/strava-sync.md).
  const eligible = !!session && !!coach && progress?.kind !== 'race' && !own && !dismissed && !!plan && !ratingWasDismissed(plan, session) && completedViaStrava(session, coach)
  if (eligible && !offered) setOffered(true)
  const tickPrompt = !!session && !!coach && progress?.kind !== 'race' && !dismissed
    && (eligible || offered || (!!own && own.effort != null))
  const recording = progress?.kind !== 'race' && session ? recordingForToday(session, coach, runs) : null
  const open = () => progress?.kind === 'race' && onOpenRacePrep ? onOpenRacePrep() : plan && onOpenDay && progress?.kind !== 'before' ? onOpenDay(today) : onOpenPlan()
  return <section className="panel home-card home-today" aria-label="Today">
    <Runner pose={recording ? 'victory' : day?.runs.length ? 'crouch' : 'sleep'} size={54} className="home-today-runner" />
    <p className="plan-kicker">Today</p>
    {session && coach?.get(session)?.status === 'Done' && <span className="chip home-done-chip">Done</span>}
    <h2 id="home-today" className="home-card-heading">{recording ? formatDistance(recording.distanceKm, units) : progress?.kind === 'race' ? 'Race day.' : day?.runs[0]?.title ?? (day?.strength.length ? 'No run today' : progress?.kind === 'before' ? 'Your plan' : 'Rest day')}</h2>
    {!plan ? failed ? <p>Today’s session will appear when your plan loads.</p> : <div className="skeleton-stack" role="status" aria-label="Loading today's session"><span className="skeleton-line skeleton-line-wide" /><span className="skeleton-line" /></div>
      : progress?.kind === 'before' ? <p>Your plan starts {formatDate(plan.startDate, 'long')}. Easy running until then.</p>
      : progress?.kind === 'race' ? <p className="home-today-title">{plan.race.name}. Start easy, trust your training and enjoy it.</p>
      : own && own.status !== 'Skipped' ? <><RunResult entry={own} runs={runs} units={units} compact /><p className="home-recorded-source">{own.distanceKm != null || own.duration ? 'Manually logged' : recording ? `${recording.source.kind === 'Strava' ? 'Strava' : 'Upload'} · moving time` : own.activityId ? 'Linked recording is no longer available.' : 'Confirmed without recorded measurements'}</p></>
      : recording ? <><p className="home-recorded-source">{recording.source.kind === 'Strava' ? 'Imported from Strava' : 'From your upload'}</p><p className="field-help">{formatDuration(recording.movingSeconds)} moving{recording.distanceKm > 0 && recording.movingSeconds > 0 ? ` · ${formatPace(recording.movingSeconds / recording.distanceKm, units)}` : ''}</p></>
      : day?.runs.length ? day.runs.map((value, index) => {
        const pace = plan.paces.find(pace => pace.zone === value.zone)
        const own = coach?.get(value)
        return <div key={`${value.date}|${value.type}`}><p className="home-today-title">{index > 0 && value.title}{own && <span className={own.status === 'Done' ? 'chip home-done-chip' : 'chip home-status-chip'}>{own.status === 'Done' ? 'Done' : own.status === 'Skipped' ? 'Skipped' : 'Logged'}</span>}</p>
          <dl className="home-workout-facts">{value.distanceKm > 0 && <div><dt>Distance</dt><dd className="mono">{formatDistance(value.distanceKm, units)}</dd></div>}{pace && <div><dt>Target pace</dt><dd className="mono">{formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units)}</dd></div>}</dl><p className="field-help">{value.detail}</p></div>
      }) : <><p>{day?.strength.length ? 'Your running takes a break. Your strength session is below.' : 'Legs up. Rest is when the training turns into fitness.'}</p>{day?.next && <p className="field-help">Next: {day.next.title}, {formatDate(day.next.date)}</p>}</>}
    {session && (recording || own && own.status !== 'Skipped') && <p className="field-help">Planned: {session.title}{session.distanceKm > 0 ? ` · ${formatDistance(session.distanceKm, units)}` : ''}</p>}
    {day?.strength.map(value => <section key={value.type} className="home-today-strength" aria-label="Strength session"><p className="home-today-title">{value.title}</p><p className="field-help">{value.exercises.length} exercises · Open your plan for set tracking.</p></section>)}
    {progress && progress.daysToGo > 0 && progress.daysToGo <= 7 && <p className="field-help">{progress.daysToGo} days to {plan!.race.name}</p>}
    {progress && progress.daysToGo > 0 && progress.daysToGo <= 7 && onOpenRacePrep && <button type="button" className="link-button" onClick={onOpenRacePrep}>Race-day checklist and pacing</button>}
    {tickPrompt && session && coach && <section className="home-tick-prompt" aria-label="Rate today’s run">
      {!own && <p className="home-today-title">You ran today. Nice work.</p>}
      <PostRunRating session={session} coach={coach} quickTick onFullForm={() => setLogging(true)} onDismiss={() => {
        dismiss(today)
        if (plan) dismissRating(plan, session)
        setDismissedOn(today)
      }} />
    </section>}
    {recording ? <button type="button" className="button button-primary" onClick={() => onOpenRun(recording.id)}>Open run details</button> : <button type="button" className="button button-primary" onClick={open}>{progress?.kind === 'race' ? 'Open race day' : plan && onOpenDay && progress?.kind !== 'before' ? "Open today's workout" : 'Open your plan'}</button>}
    {/* While the rating is asking, its More details opens this log: one way in, not two. */}
    {session && coach && progress?.kind !== 'race' && (!tickPrompt || own || logging) && <div className="home-manual"><button type="button" className="link-button" aria-expanded={logging} onClick={() => setLogging(value => !value)}>{logging ? 'Close run log' : coach.get(session) ? 'Edit run log' : 'Log a run manually'}</button>{logging && <>{!tickPrompt && <StravaCompletion session={session} coach={coach} />}<CheckInCard session={session} coach={coach} runs={runs} done={!!coach.get(session) && coach.get(session)!.status !== 'Skipped'} compactActions /></>}</div>}
  </section>
}
