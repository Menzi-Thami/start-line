import type { Exercise, Session } from '../../lib/types'
import { EXERCISES, formatDose, formatSet } from './exercises'
import { ExerciseFigure } from './ExerciseFigure'
import { setKey, withSetDone, type DoneUpdate } from './strength-progress'

interface Tracking {
  session: Session
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
}

function ExerciseCard({ exercise, step, prescription, tracking }: {
  exercise: Exercise
  /** Where it comes in the session, counting from 1. Library cards have none. */
  step?: number
  prescription?: Session['exercises'][number]
  tracking?: Tracking
}) {
  const info = EXERCISES[exercise]
  const sets = prescription ? Array.from({ length: prescription.sets }, (_, i) => i) : []
  const ticked = tracking ? sets.filter((i) => tracking.done.has(setKey(tracking.session, exercise, i))).length : 0
  const complete = sets.length > 0 && ticked === sets.length

  return (
    <li className={`exercise${complete ? ' is-done' : ''}`} data-exercise={exercise}>
      <div className="exercise-demo">
        {step !== undefined && (
          <span className="exercise-step mono" aria-hidden="true">
            {step}
          </span>
        )}
        <ExerciseFigure exercise={exercise} />
      </div>
      <div className="exercise-body">
        <div className="exercise-head">
          <span className="exercise-name">{info.name}</span>
          {prescription && <span className="exercise-dose mono">{formatDose(prescription)}</span>}
        </div>
        <p className="exercise-how">{info.howTo}</p>
        <ul className="exercise-cues" aria-label={`${info.name} cues`}>
          {info.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
        {!prescription && <p className="session-why">Why: {info.why}</p>}
      </div>
      {prescription && tracking && (
        <fieldset className="exercise-sets">
          <legend className="visually-hidden">{info.name} sets</legend>
          {sets.map((i) => (
            <label className="pill exercise-set" key={i}>
              <input
                type="checkbox"
                checked={tracking.done.has(setKey(tracking.session, exercise, i))}
                onChange={(e) => {
                  const isDone = e.target.checked
                  tracking.onDoneChange((done) => withSetDone(done, tracking.session, exercise, i, isDone))
                }}
                aria-label={`${info.name}, set ${i + 1} of ${sets.length}: ${formatSet(prescription)}`}
              />
              Set {i + 1}
            </label>
          ))}
        </fieldset>
      )}
    </li>
  )
}

/**
 * A strength session's exercises as a numbered list, in the order to do them: each with its own demo, a line on how
 * to do it, a few cues, its sets and reps, and a tick for every set.
 */
export function ExerciseList({ session, done, onDoneChange }: Tracking) {
  return (
    <ol className="exercises" aria-label={`${session.title}: exercises in order`}>
      {session.exercises.map((e, i) => (
        <ExerciseCard key={e.exercise} exercise={e.exercise} step={i + 1} prescription={e} tracking={{ session, done, onDoneChange }} />
      ))}
    </ol>
  )
}

/** Every move with its demo and cues, for runners who haven't added strength days yet. */
export function ExerciseLibrary() {
  return (
    <ul className="exercises">
      {(Object.keys(EXERCISES) as Exercise[]).map((exercise) => (
        <ExerciseCard key={exercise} exercise={exercise} />
      ))}
    </ul>
  )
}
