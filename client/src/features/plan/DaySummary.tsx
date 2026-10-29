import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
export default function DaySummary({ date, today, plan, units, done, onDoneChange, runs = [], coach, canCompleteRuns, onOpenRun, onClose }: Props) {
  const id = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const backdropStart = useRef(false)
  const [requestedRun, setRequestedRun] = useState<ActivitySummary>()
  const sessions = plan.weeks.flatMap(week => week.sessions).filter(session => session.date === date)
  const entries = (coach?.entries ?? sessions.flatMap(session => { const entry = coach?.get(session); return entry ? [entry] : [] }))
    .filter(entry => entry.date === date && entry.status !== 'Skipped' && entry.sessionType !== 'Strength')
  const dayRuns = [...new Map(runs.filter(run => run.localDate === date && run.kind !== 'Other').map(run => [run.id, run])).values()]
  const unlinked = dayRuns.filter(run => !entries.some(entry => entry.activityId === run.id))
  const deviceRuns = sessions.filter(session => session.type !== 'Strength' && done.has(sessionKey(session)) && !coach?.get(session))
  const completedStrength = sessions.filter(session => session.type === 'Strength' && done.has(sessionKey(session)))
  const inPlan = date >= plan.startDate && date <= plan.race.date
  const future = date > today
  const historyReady = canCompleteRuns

  useEffect(() => {
    const dialog = dialogRef.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      dialog.close()
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [])

  const savedSession = (entry: CheckIn): Session => sessions.find(session => session.type === entry.sessionType) ?? {
    date, type: entry.sessionType, title: 'Logged run', distanceKm: 0, zone: null, detail: '', purpose: '', exercises: [], steps: [],
  }
  const openRun = (runId: string) => { onClose(); onOpenRun?.(runId) }
  const logRun = (run: ActivitySummary) => {
    setRequestedRun(run)
    requestAnimationFrame(() => logRef.current?.scrollIntoView?.({ block: 'nearest' }))
  }

  return createPortal(
    <dialog ref={dialogRef} className="day-summary" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`}
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]')]
          .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0)
        const first = controls[0]
        const last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClose={onClose}
      onPointerDown={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        backdropStart.current = event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
      }}
      onClick={event => { if (backdropStart.current && event.target === event.currentTarget) onClose(); backdropStart.current = false }}>
      <div className="day-summary-head">
        <div>
          <p className="plan-kicker">{date === today ? 'Today' : future ? 'Coming up' : 'Your training day'}</p>
          <h2 id={`${id}-title`}>{formatDate(date, 'long')}</h2>
        </div>
        <button type="button" className="button button-quiet" autoFocus onClick={onClose}>Close day</button>
      </div>
      <p id={`${id}-intro`} className="field-help">Your plan alongside what you recorded. Logging an extra run keeps the original workout visible.</p>

      <div className="day-summary-columns">
        <section aria-labelledby={`${id}-planned`} className="day-summary-section">
          <h3 id={`${id}-planned`}>Planned</h3>
          {sessions.length === 0 && <div className="day-summary-card"><h4>{inPlan ? 'Rest day' : 'Outside this plan'}</h4><p>{inPlan ? 'No workout scheduled. Recovery is part of your training.' : 'There are no scheduled sessions from this plan on this date.'}</p></div>}
          {sessions.map(session => {
            const entry = coach?.get(session)
            const complete = done.has(sessionKey(session))
            const pace = plan.paces.find(pace => pace.zone === session.zone)
            return <article key={sessionKey(session)} className="day-summary-card" aria-label={`Planned: ${session.title}`}>
              {session.type === 'Strength' ? future ? <><h4>{session.title}</h4><p>{session.exercises.length} exercises · Upcoming</p><p>{session.detail}</p></> : <><h4>{session.title}</h4><p className="day-summary-status">{complete ? 'Completed on this device' : 'No completion recorded'}</p><details className="session-more"><summary>View exercises and completion</summary><SessionItem session={session} units={units} pace={undefined} done={done} onDoneChange={onDoneChange} /></details></> : <>
                <h4>{session.title}</h4>
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
          <h3 id={`${id}-recorded`}>Recorded</h3>
          {!historyReady && <p role="status">Saved run history is not available yet. Close this day to check loading or retry above the plan.</p>}
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
              <h4>{formatDistance(run.distanceKm, units)}</h4>
              <p className="mono">{formatDuration(run.movingSeconds)}{run.distanceKm > 0 && run.movingSeconds > 0 ? ` · ${formatPace(run.movingSeconds / run.distanceKm, units)}` : ''}</p>
              <p className="field-help">Moving time{run.averageHeartRate ? ` · ${run.averageHeartRate} bpm average` : ''}. {sessions.some(session => session.type !== 'Strength') ? 'A recorded run does not automatically complete the planned workout.' : 'Run recorded without a scheduled running session.'}</p>
              <div className="day-summary-actions">
                {onOpenRun && <button type="button" className="link-button" onClick={() => openRun(run.id)}>View run</button>}
                {historyReady && coach?.saveAdditional && inPlan && <button type="button" className="link-button" onClick={() => logRun(run)}>Log this run</button>}
              </div>
              <RunSticker units={units} run={{ date, title: 'Run completed', distanceKm: run.distanceKm, seconds: run.movingSeconds, source: run.source.kind }} />
            </article>)}
            {historyReady && deviceRuns.map(session => <div key={sessionKey(session)} className="day-summary-card"><h4>{session.title} completed</h4><p className="field-help">Completed on this device. Actual distance and time were not recorded.</p></div>)}
            {completedStrength.map(session => <div key={sessionKey(session)} className="day-summary-card"><h4>{session.title} completed</h4><p className="field-help">Strength completion is saved on this device.</p></div>)}
            {historyReady && entries.length === 0 && unlinked.length === 0 && deviceRuns.length === 0 && completedStrength.length === 0 && <div className="day-summary-empty"><p>No activity recorded for this date.</p><p className="field-help">A blank day means nothing has been recorded here; it doesn’t tell us whether you trained.</p></div>}
          </>}
          {historyReady && coach && inPlan && !future && <div ref={logRef}><RunLog key={requestedRun?.id ?? 'manual'} plan={plan} coach={coach} runs={dayRuns} fixedDate={date} initialRun={requestedRun} onClose={() => setRequestedRun(undefined)} showEntries={false} /></div>}
          {!coach && historyReady && <p className="field-help">{runs.length ? 'Open your own saved plan to log or edit runs.' : 'On a shared plan, completion ticks stay on this device. Sign in and save your own plan to keep a run log.'}</p>}
        </section>
      </div>
    </dialog>, document.body,
  )
}
