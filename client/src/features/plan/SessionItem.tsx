import { useState } from 'react'
import { formatDistance, formatPaceRange, type Units } from '../../lib/format'
import type { ActivitySummary, PaceZoneRange, Session } from '../../lib/types'
import { ZONES } from './copy'
import { CheckInCard } from '../coaching/CheckInCard'
import { StravaCompletion } from '../coaching/StravaCompletion'
import { completedViaStrava } from '../coaching/strava-completion'
import type { SessionCoach } from '../coaching/useCheckIns'
import { ExerciseList } from '../strength/ExerciseList'
import { SessionSteps } from './SessionSteps'
import { RunWalkChip } from './RunWalkChip'
import { setsDone, withSessionDone, type DoneUpdate } from '../strength/strength-progress'
import { sessionKey } from './plan-math'
import { count } from '../../lib/plural'

/** One planned session, in full: how to run it, its steps, and its check-in. */
export function SessionItem({ session, pace, units, done, onDoneChange, coach, dayRuns, canCompleteRuns = true, expanded = false }: {
  session: Session
  pace: PaceZoneRange | undefined
  units: Units
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
  coach?: SessionCoach
  /** The runner's runs on the session's day, for linking a check-in to one. */
  dayRuns?: readonly ActivitySummary[]
  canCompleteRuns?: boolean
  expanded?: boolean
}) {
  // Counts ticks made here, so confetti bursts when a session is ticked, not every time a done one is shown.
  const [bursts, setBursts] = useState(0)
  // Done includes a session a held Strava run completes (computed, never stored); the check-in's own tick stays the runner's.
  const isDone = done.has(sessionKey(session))
  const viaStrava = completedViaStrava(session, coach)
  const strength = session.type === 'Strength'
  const zone = !strength && session.zone ? ZONES[session.zone] : undefined
  const numbers = strength ? [count(session.exercises.length, 'exercise')] : [
    session.distanceKm > 0 ? formatDistance(session.distanceKm, units) : null,
    pace && zone ? `${zone.name} ${formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units)}` : null,
  ].filter(Boolean)
  const sets = setsDone(done, session)

  return (
    <div className={`session${strength ? ' session-strength' : ''}${isDone ? ' is-done' : ''}`}>
      <div className="session-head">
        {strength && <span className="chip">Strength</span>}
        {zone && <span className="effort-dot" style={{ background: zone.colour }} aria-hidden="true" />}
        <span className="session-title">{session.title}</span>
        {numbers.length > 0 && <span className="session-numbers">{numbers.join(' · ')}</span>}
        <RunWalkChip runWalk={session.runWalk} />
      </div>
      {/* Compact: the session's name and numbers lead; how to run it and why open from the chevron (and always print). */}
      <details className="session-more" open={expanded || undefined}>
        <summary>{session.type === 'Strength' ? 'About this session' : 'How to run it'}</summary>
        <p className="session-detail">{session.detail}</p>
        <SessionSteps steps={session.steps} units={units} />
        <p className="session-why">Why: {session.purpose}</p>
      </details>
      {session.exercises.length > 0 && (expanded ? <div className="strength-moves"><p className="strength-moves-head">{sets.done}/{sets.total} sets</p><ExerciseList session={session} done={done} onDoneChange={onDoneChange} /></div> :
        <details className="strength-moves strength-disclosure">
          <summary>View exercises · {sets.done}/{sets.total} sets done</summary>
          <p className="strength-moves-head">
            <span>In this order</span>
            <span className="strength-moves-count mono" aria-live="polite">
              {sets.done}/{sets.total} sets
            </span>
          </p>
          <ExerciseList session={session} done={done} onDoneChange={onDoneChange} />
        </details>
      )}
      {session.type !== 'Race' && (strength || !coach) && (
        <label className="session-done">
          <span className="tick-wrap">
            <input
              type="checkbox"
              checked={isDone}
              disabled={!strength && !canCompleteRuns}
              onChange={(e) => {
                const checked = e.target.checked
                if (checked) setBursts((n) => n + 1)
                onDoneChange((current) => withSessionDone(current, session, checked))
              }}
            />
            {bursts > 0 && isDone && (
              <span className="sparks" key={bursts} aria-hidden="true">
                {[0, 60, 120, 180, 240, 300].map((a) => (
                  <i key={a} style={{ ['--a' as string]: `${a}deg` }} />
                ))}
              </span>
            )}
          </span>
          Done
        </label>
      )}
      {coach && session.type !== 'Strength' && session.type !== 'Race' && (
        <>
          {/* A check-in that says the run happened ticks it off too, and a skipped one unticks it. */}
          <StravaCompletion session={session} coach={coach} />
          <CheckInCard session={session} coach={coach} runs={dayRuns} completion done={isDone && !viaStrava} onDone={(ran) => onDoneChange((current) => withSessionDone(current, session, ran))} />
        </>
      )}
    </div>
  )
}

