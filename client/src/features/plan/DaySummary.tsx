import { useEffect, useId, useRef, useState } from 'react'
import { formatDate, formatDistance, formatDuration, formatPace, formatPaceRange, type Units } from '../../lib/format'
import type { ActivitySummary, CheckIn, Session, TrainingPlan } from '../../lib/types'
import { AdditionalRun } from '../coaching/AdditionalRun'
import { CheckInCard } from '../coaching/CheckInCard'
import { RunLog } from '../coaching/RunLog'
import type { SessionCoach } from '../coaching/useCheckIns'
import { RunSticker } from '../sharing/RunSticker'
import { withSessionDone, type DoneUpdate } from '../strength/strength-progress'
import { sessionKey } from './plan-math'
import { SessionSteps } from './SessionSteps'
import { SessionItem } from './WeekList'

interface Props {
  id: string
  trigger?: HTMLButtonElement
  date: string
  today: string
  plan: TrainingPlan
  units: Units
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
  runs?: readonly ActivitySummary[]
  coach?: SessionCoach
  canCompleteRuns: boolean
  onOpenRun?: (id: string) => void
  onClose: () => void
}

/** One date, with prescription and history kept separate. Opening it never changes completion. */
export default function DaySummary({ id: panelId, trigger, date, today, plan, units, done, onDoneChange, runs, coach, canCompleteRuns, onOpenRun, onClose }: Props) {
  const id = useId()
  const panelRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const [requestedRun, setRequestedRun] = useState<ActivitySummary>()
  const sessions = plan.weeks.flatMap(week => week.sessions).filter(session => session.date === date)
  const entries = (coach?.entries ?? sessions.flatMap(session => { const entry = coach?.get(session); return entry ? [entry] : [] }))
    .filter(entry => entry.date === date && entry.status !== 'Skipped' && entry.sessionType !== 'Strength')
  const importsUnavailable = !!coach && runs === undefined
  const dayRuns = [...new Map((runs ?? []).filter(run => run.localDate === date && run.kind !== 'Other').map(run => [run.id, run])).values()]
  const unlinked = dayRuns.filter(run => !entries.some(entry => entry.activityId === run.id))
  const deviceRuns = sessions.filter(session => session.type !== 'Strength' && done.has(sessionKey(session)) && !coach?.get(session))
  const completedStrength = sessions.filter(session => session.type === 'Strength' && done.has(sessionKey(session)))
  const inPlan = date >= plan.startDate && date <= plan.race.date
  const future = date > today
  const historyReady = canCompleteRuns

  const close = () => {
    onClose()
    if (trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus({ preventScroll: true })
  }

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    panelRef.current?.scrollIntoView?.({ block: 'nearest' })
    const dismiss = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        const restoreFocus = panelRef.current?.contains(document.activeElement) || document.activeElement === document.body
        onClose()
        if (restoreFocus && trigger?.isConnected && !trigger.closest('[hidden]')) trigger.focus({ preventScroll: true })
      } else if (event.target instanceof Element && !panelRef.current?.contains(event.target) && !event.target.closest('.week-day-button, .plan-calendar-day')) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
    }
  }, [onClose, trigger])

  const savedSession = (entry: CheckIn): Session => sessions.find(session => session.type === entry.sessionType) ?? {
    date, type: entry.sessionType, title: 'Logged run', distanceKm: 0, zone: null, detail: '', purpose: '', exercises: [], steps: [],
  }
  const openRun = (runId: string) => { onClose(); onOpenRun?.(runId) }
  const logRun = (run: ActivitySummary) => {
    setRequestedRun(run)
    requestAnimationFrame(() => logRef.current?.scrollIntoView?.({ block: 'nearest' }))
  }

  return (
    <section id={panelId} ref={panelRef} className="day-summary" aria-labelledby={`${id}-title`}>
      <div className="day-summary-head">
        <h3 id={`${id}-title`} ref={headingRef} tabIndex={-1}>{formatDate(date, 'long')}</h3>
        <button type="button" className="day-summary-close" aria-label="Close day" onClick={() => close()}>×</button>
      </div>
      <div className="day-summary-columns">
        <section aria-labelledby={`${id}-planned`} className="day-summary-section">
          <h4 id={`${id}-planned`}>Planned</h4>
          {sessions.length === 0 && <div className="day-summary-card"><h5>{inPlan ? 'Rest day' : 'Outside this plan'}</h5><p>{inPlan ? 'No workout scheduled.' : 'There are no scheduled sessions from this plan on this date.'}</p></div>}
          {sessions.map(session => {
            const entry = coach?.get(session)
            const complete = done.has(sessionKey(session))
            const pace = plan.paces.find(pace => pace.zone === session.zone)
            return <article key={sessionKey(session)} className="day-summary-card" aria-label={`Planned: ${session.title}`}>
              {session.type === 'Strength' ? future ? <><h5>{session.title}</h5><p>{session.exercises.length} exercises · Upcoming</p><p>{session.detail}</p></> : <><h5>{session.title}</h5><p className="day-summary-status">{complete ? 'Completed on this device' : 'No completion recorded'}</p><details className="session-more"><summary>View exercises and completion</summary><SessionItem session={session} units={units} pace={undefined} done={done} onDoneChange={onDoneChange} /></details></> : <>
                <h5>{session.title}</h5>
                <p className="mono">{formatDistance(session.distanceKm, units)}{pace ? ` · ${formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units)}` : ''}</p>
                <p className="day-summary-status">{!historyReady ? 'Completion history unavailable' : entry?.status === 'Skipped' ? 'Skipped' : complete ? 'Completed' : future ? 'Upcoming' : date === today ? 'Scheduled today' : 'No completion recorded'}</p>
                <details className="session-more"><summary>How to run it</summary><p>{session.detail}</p><SessionSteps steps={session.steps} units={units} /><p className="session-why">Why: {session.purpose}</p></details>
                {historyReady && coach && (!entry || entry.status === 'Skipped') && session.type !== 'Race' && <CheckInCard session={session} coach={coach} runs={dayRuns} completion done={complete} onDone={value => onDoneChange(current => withSessionDone(current, session, value))} />}
                {historyReady && !coach && session.type !== 'Race' && !future && <label className="session-done"><input type="checkbox" checked={complete} onChange={event => onDoneChange(current => withSessionDone(current, session, event.target.checked))} /> Complete on this device</label>}
              </>}
            </article>
          })}
        </section>

        <section aria-labelledby={`${id}-recorded`} className="day-summary-section">
          <h4 id={`${id}-recorded`}>Recorded</h4>
          {!historyReady && <p role="status">Saved run history is not available yet. Close this day to check loading or retry above the plan.</p>}
          {importsUnavailable && <p role="status">Imported runs have not loaded. Your saved run entries are still available. Refresh Taperday to try loading imports again.</p>}
          {future ? <p className="field-help">This date hasn’t arrived yet. Completed sessions will appear here when recorded.</p> : <>
            {historyReady && coach && entries.map(entry => <div key={entry.id ?? `${entry.date}|${entry.sessionType}`} className="day-summary-saved">
              {entry.isAdditional ? <AdditionalRun entry={entry} coach={coach} runs={dayRuns} onOpenRun={onOpenRun ? openRun : undefined} /> : <>
                <CheckInCard key={entry.updatedAt} session={savedSession(entry)} coach={{ ...coach, get: () => entry }} runs={dayRuns} completion done onDone={value => onDoneChange(current => withSessionDone(current, savedSession(entry), value))} />
                {onOpenRun && entry.activityId && dayRuns.some(run => run.id === entry.activityId) && <button type="button" className="link-button" onClick={() => openRun(entry.activityId!)}>View imported run</button>}
              </>}
              {entry.note && <p className="field-help">Your note: {entry.note}</p>}
            </div>)}
            {unlinked.map(run => <article key={run.id} className="day-summary-card" aria-label={`Recorded run: ${formatDistance(run.distanceKm, units)}`}>
              <p className="wait-tip-label">{run.source.kind === 'Strava' ? 'Strava' : 'Uploaded activity'}</p>
              <h5>{formatDistance(run.distanceKm, units)}</h5>
              <p className="mono">{formatDuration(run.movingSeconds)}{run.distanceKm > 0 && run.movingSeconds > 0 ? ` · ${formatPace(run.movingSeconds / run.distanceKm, units)}` : ''}</p>
              <p className="field-help">Moving time{run.averageHeartRate ? ` · ${run.averageHeartRate} bpm average` : ''}</p>
              <div className="day-summary-actions">
                {onOpenRun && <button type="button" className="link-button" onClick={() => openRun(run.id)}>View run</button>}
                {historyReady && coach?.saveAdditional && inPlan && <button type="button" className="link-button" onClick={() => logRun(run)}>Log this run</button>}
              </div>
              <RunSticker units={units} run={{ date, title: 'Run completed', distanceKm: run.distanceKm, seconds: run.movingSeconds, source: run.source.kind }} />
            </article>)}
            {historyReady && deviceRuns.map(session => <div key={sessionKey(session)} className="day-summary-card"><h5>{session.title} completed</h5><p className="field-help">Completed on this device. Actual distance and time were not recorded.</p></div>)}
            {completedStrength.map(session => <div key={sessionKey(session)} className="day-summary-card"><h5>{session.title} completed</h5><p className="field-help">Strength completion is saved on this device.</p></div>)}
            {historyReady && !importsUnavailable && entries.length === 0 && unlinked.length === 0 && deviceRuns.length === 0 && completedStrength.length === 0 && <div className="day-summary-empty"><p>No activity recorded for this date.</p><p className="field-help">A blank day means nothing has been recorded here; it doesn’t tell us whether you trained.</p></div>}
          </>}
          {historyReady && coach && inPlan && !future && <div ref={logRef}><RunLog key={requestedRun?.id ?? 'manual'} plan={plan} coach={coach} runs={dayRuns} fixedDate={date} initialRun={requestedRun} onClose={() => { setRequestedRun(undefined); headingRef.current?.focus({ preventScroll: true }) }} showEntries={false} /></div>}
          {!coach && historyReady && <p className="field-help">{runs?.length ? 'Open your own saved plan to log or edit runs.' : 'On a shared plan, completion ticks stay on this device. Sign in and save your own plan to keep a run log.'}</p>}
        </section>
      </div>
    </section>
  )
}
