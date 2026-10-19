import type { Exercise, Session } from '../../lib/types'
import { EXERCISES, formatDose, formatSet } from './exercises'
import { ExerciseFigure } from './ExerciseFigure'
import { setKey, withSetDone, type DoneUpdate } from './strength-progress'

interface Tracking {
  session: Session
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
}

function ExerciseCard({ exercise, prescription, tracking }: {
  exercise: Exercise
  prescription?: Session['exercises'][number]
  tracking?: Tracking
}) {
  const info = EXERCISES[exercise]
  const sets = prescription ? Array.from({ length: prescription.sets }, (_, i) => i) : []
  const ticked = tracking ? sets.filter((i) => tracking.done.has(setKey(tracking.session, exercise, i))).length : 0
  const complete = sets.length > 0 && ticked === sets.length

  return (
    <li className={`exercise${complete ? ' is-done' : ''}`}>
      <div className="exercise-demo">
        <ExerciseFigure exercise={exercise} />
      </div>
      <div className="exercise-body">
        <div className="session-head">
          <span className="exercise-name">{info.name}</span>
          {prescription && <span className="session-numbers">{formatDose(prescription)}</span>}
        </div>
        <ol className="exercise-cues">
          {info.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ol>
        <p className="session-why">Why: {info.why}</p>
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
      </div>
    </li>
  )
}

/** A strength session's exercises, each with its demo, its sets and reps, and a tick for every set. */
export function ExerciseList({ session, done, onDoneChange }: Tracking) {
  return (
    <ol className="exercises">
      {session.exercises.map((e) => (
        <ExerciseCard key={e.exercise} exercise={e.exercise} prescription={e} tracking={{ session, done, onDoneChange }} />
      ))}
    </ol>
  )
}

/** Every move with its demo and cues, for runners who haven't added strength days yet. */
export function ExerciseLibrary() {
  return (
    <ol className="exercises">
      {(Object.keys(EXERCISES) as Exercise[]).map((exercise) => (
        <ExerciseCard key={exercise} exercise={exercise} />
      ))}
    </ol>
  )
}
