import { formatDate } from '../../lib/format'
import type { PlanWeek, TrainingPlan } from '../../lib/types'
import { ExerciseLibrary, ExerciseList } from './ExerciseList'
import { setsDone, type DoneUpdate } from './strength-progress'

interface Props {
  plan: TrainingPlan
  /** The week "This week" shows, so both tabs talk about the same days. */
  week: PlanWeek | undefined
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
  onEditStrength?: () => void
}

/**
 * The plan's strength work for the week: each session's exercises with a demo, sets and reps, and a tick per set.
 * Without strength days it shows every move, so the runner can see what they'd be adding.
 */
export function StrengthTab({ plan, week, done, onDoneChange, onEditStrength }: Props) {
  const hasStrength = plan.weeks.some((w) => w.sessions.some((s) => s.exercises.length > 0))
  const sessions = week?.sessions.filter((s) => s.exercises.length > 0) ?? []

  if (!hasStrength) {
    return (
      <>
        <p className="tab-intro">
          Choose strength days to add sessions to your running plan. Build the updated plan, then use Save changes if you want to keep it in your account.
        </p>
        {onEditStrength && <button type="button" className="button" onClick={onEditStrength}>Add strength days</button>}
        <h3>The moves</h3>
        <ExerciseLibrary />
      </>
    )
  }

  return (
    <>
      <p className="tab-intro">
        Tick each set as you finish it.
      </p>
      {onEditStrength && <button type="button" className="button button-quiet" onClick={onEditStrength}>Change strength days</button>}
      {sessions.length === 0 && (
        <p className="empty">{week?.phase === 'RaceWeek' ? 'No strength in race week: it’s for fresh legs.' : 'No strength this week.'}</p>
      )}
      {sessions.map((session) => {
        const progress = setsDone(done, session)
        return (
          <section className="strength-session" key={session.date} aria-labelledby={`strength-${session.date}`}>
            <div className="this-week-head">
              <h3 id={`strength-${session.date}`}>
                {formatDate(session.date, 'weekday')} {formatDate(session.date, 'dayMonth')} · {session.title}
              </h3>
              <p className="week-meta" aria-live="polite">
                {progress.done === progress.total ? 'All sets done. Nice work.' : `${progress.done} of ${progress.total} sets done`}
              </p>
            </div>
            <p className="session-why">Why: {session.purpose}</p>
            <ExerciseList session={session} done={done} onDoneChange={onDoneChange} />
          </section>
        )
      })}
    </>
  )
}
