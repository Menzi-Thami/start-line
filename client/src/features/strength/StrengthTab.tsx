import { PrivateGym } from '../private-plans/PrivateGym'
import { formatDate } from '../../lib/format'
import type { PlanWeek, TrainingPlan } from '../../lib/types'
import { ExerciseLibrary, ExerciseList } from './ExerciseList'
import { setsDone, type DoneUpdate } from './strength-progress'
import { count } from '../../lib/plural'

interface Props {
  plan: TrainingPlan
  /** The week "This week" shows, so both tabs talk about the same days. */
  week: PlanWeek | undefined
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
  onEditStrength?: () => void
  readOnly?: boolean
  planId?: string | null
  today?: string
  onPlanChanged?: (plan: TrainingPlan) => void
}

/**
 * The plan's strength work for the week: each session's exercises with a demo, sets and reps, and a tick per set.
 * Without strength days it shows every move, so the runner can see what they'd be adding.
 */
export function StrengthTab({ plan, week, done, onDoneChange, onEditStrength, readOnly = false, planId, today, onPlanChanged }: Props) {
  if (plan.isPrivate) return <>
    <p className="tab-intro">Your private gym sessions. Completion is kept separately from running.</p>
    {week?.sessions.filter(s => s.type === 'Strength').map(session => planId && today && onPlanChanged
      ? <PrivateGym key={`${session.prescriptionId}|${session.date}`} planId={planId} session={session} today={today} onChanged={onPlanChanged} readOnly={readOnly} />
      : <article key={session.prescriptionId} className="strength-session"><h3>{formatDate(session.date)} · {session.title}</h3><p>{session.detail}</p></article>)}
  </>
  const hasStrength = plan.weeks.some((w) => w.sessions.some((s) => s.exercises.length > 0))
  const sessions = week?.sessions.filter((s) => s.exercises.length > 0) ?? []

  if (!hasStrength) {
    return (
      <>
        <p className="tab-intro">
          {readOnly ? 'No strength sessions were scheduled in this training chapter.' : 'Choose strength days to add sessions to your running plan. Updates to your saved plan keep your logged runs.'}
        </p>
        {onEditStrength && <button type="button" className="button" onClick={onEditStrength}>Add strength days</button>}
        <details className="disclosure"><summary>Preview the exercises</summary><ExerciseLibrary /></details>
      </>
    )
  }

  return (
    <>
      <p className="tab-intro">
        {readOnly ? 'Your saved strength sessions.' : 'Tick each set as you finish it.'}
      </p>
      {!readOnly && <p className="field-help">Set ticks are saved on this device.</p>}
      {onEditStrength && <button type="button" className="button button-quiet" onClick={onEditStrength}>Change strength days</button>}
      {sessions.length === 0 && (
        <p className="empty">{week?.phase === 'RaceWeek' ? 'No strength in race week: it’s for fresh legs.' : 'No strength this week.'}</p>
      )}
      {sessions.map((session) => {
        const progress = setsDone(done, session)
        return (
          <details className="strength-session strength-disclosure" key={session.date}>
            <summary><h3 id={`strength-${session.date}`} className="strength-session-title">{formatDate(session.date)} · {session.title}</h3><span className="field-help" aria-live="polite">{count(session.exercises.length, 'exercise')} · {progress.done}/{progress.total} sets done</span></summary>
            <p className="week-meta" aria-live="polite">{progress.done === progress.total ? 'All sets done. Nice work.' : `${progress.done} of ${progress.total} sets done`}</p>
            <p className="session-detail">{session.detail}</p>
            <p className="session-why">Why: {session.purpose}</p>
            <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }} aria-label={`Strength sets for ${session.date}`}>
              <ExerciseList session={session} done={done} onDoneChange={onDoneChange} />
            </fieldset>
          </details>
        )
      })}
    </>
  )
}
