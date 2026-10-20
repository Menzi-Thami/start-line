import { useState } from 'react'
import { addDays, formatDate, formatDistance, formatPaceRange, type Units } from '../../lib/format'
import { dayRuns, type RunsByDate } from '../../lib/plan-runs'
import type { ActivitySummary, PaceZone, PaceZoneRange, PlanWeek, Session } from '../../lib/types'
import { PHASES, ZONES } from './copy'
import { Runner } from '../shared/Runner'
import { ExerciseList } from '../strength/ExerciseList'
import { setsDone, withSessionDone, type DoneUpdate } from '../strength/strength-progress'
import { sessionKey, trainingKm } from './plan-math'

interface Props {
  weeks: PlanWeek[]
  paces: PaceZoneRange[]
  units: Units
  currentWeek: number | null
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
  /** Uploaded runs by date. Without them, the weeks show the plan alone. */
  runs?: RunsByDate
  onOpenRun?: (id: string) => void
}

/**
 * One uploaded run beside the plan: a done mark on a day with a planned run, or a quiet line on a day without one.
 * The words carry the meaning; the tick is decoration.
 */
function RunMark({ run, units, unplanned, onOpenRun }: { run: ActivitySummary; units: Units; unplanned: boolean; onOpenRun?: (id: string) => void }) {
  const distance = formatDistance(run.distanceKm, units)
  const text = unplanned ? `Unplanned run · ${distance}` : `Ran ${distance}`
  const className = `run-mark${unplanned ? ' run-mark-unplanned' : ''}`
  const content = (
    <>
      <svg className="run-mark-tick" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
      <span>{text}</span>
    </>
  )
  if (!onOpenRun) return <span className={className}>{content}</span>
  // The name starts with what the button does and still holds the words on it, for voice control.
  const day = formatDate(run.localDate, 'long').replace(/ \d{4}$/, '')
  return (
    <button type="button" className={`${className} run-mark-button`} aria-label={`Open your run on ${day}: ${text}`} onClick={() => onOpenRun(run.id)}>
      {content}
    </button>
  )
}

function SessionItem({ session, pace, units, done, onDoneChange }: {
  session: Session
  pace: PaceZoneRange | undefined
  units: Units
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
}) {
  // Counts ticks made here, so confetti bursts when a session is ticked, not every time a done one is shown.
  const [bursts, setBursts] = useState(0)
  const isDone = done.has(sessionKey(session))
  const zone = session.zone ? ZONES[session.zone] : undefined
  const numbers = [
    session.distanceKm > 0 ? formatDistance(session.distanceKm, units) : null,
    pace && zone ? `${zone.name} ${formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units)}` : null,
  ].filter(Boolean)
  const sets = setsDone(done, session)

  return (
    <div className={`session${isDone ? ' is-done' : ''}`}>
      <div className="session-head">
        {zone && <span className="effort-dot" style={{ background: zone.colour }} aria-hidden="true" />}
        <span className="session-title">{session.title}</span>
        {numbers.length > 0 && <span className="session-numbers">{numbers.join(' · ')}</span>}
      </div>
      <p className="session-detail">{session.detail}</p>
      <p className="session-why">Why: {session.purpose}</p>
      {session.exercises.length > 0 && (
        <div className="strength-moves">
          <p className="strength-moves-head">
            <span>In this order</span>
            <span className="strength-moves-count mono" aria-live="polite">
              {sets.done}/{sets.total} sets
            </span>
          </p>
          <ExerciseList session={session} done={done} onDoneChange={onDoneChange} />
        </div>
      )}
      {session.type !== 'Race' && (
        <label className="session-done">
          <span className="tick-wrap">
            <input
              type="checkbox"
              checked={isDone}
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
    </div>
  )
}

interface WeekDaysProps {
  week: PlanWeek
  byZone: Map<PaceZone, PaceZoneRange>
  units: Units
  done: Set<string>
  onDoneChange: (update: DoneUpdate) => void
  runs?: RunsByDate
  onOpenRun?: (id: string) => void
}

/** One week, every day listed, rest days included, so the shape of the week is obvious. */
export function WeekDays({ week, byZone, units, done, onDoneChange, runs, onOpenRun }: WeekDaysProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.startDate, i))
  return (
    <ol className="days">
      {days.map((date) => {
        const sessions = week.sessions.filter((s) => s.date === date)
        const ran = dayRuns(sessions, runs?.get(date))
        const marks = [...ran.done.map((run) => ({ run, unplanned: false })), ...ran.unplanned.map((run) => ({ run, unplanned: true }))]
        return (
          <li className="day" key={date}>
            <span className="day-date">
              {formatDate(date, 'weekday')}
              <small>{formatDate(date, 'dayMonth')}</small>
            </span>
            {sessions.length === 0 && marks.length === 0 ? (
              <span className="day-rest">
                <span className="day-rest-sleeper" aria-hidden="true">
                  <Runner pose="sleep" size={11} />
                  <span className="zzz">
                    <i>z</i>
                    <i>z</i>
                    <i>z</i>
                  </span>
                </span>
                <span>Rest</span>
              </span>
            ) : (
              <div>
                {sessions.map((s) => (
                  <SessionItem
                    key={sessionKey(s)}
                    session={s}
                    pace={s.zone ? byZone.get(s.zone) : undefined}
                    units={units}
                    done={done}
                    onDoneChange={onDoneChange}
                  />
                ))}
                {marks.length > 0 && (
                  <ul className="run-marks">
                    {marks.map(({ run, unplanned }) => (
                      <li key={run.id}>
                        <RunMark run={run} units={units} unplanned={unplanned} onOpenRun={onOpenRun} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Every week as a disclosure, every day of the week listed, rest days included, so the shape of the week is obvious. */
export function WeekList({ weeks, paces, units, currentWeek, done, onDoneChange, runs, onOpenRun }: Props) {
  const byZone = new Map(paces.map((p) => [p.zone, p]))
  const openWeek = currentWeek ?? weeks[0]?.number

  return (
    <div className="weeks">
      {weeks.map((week) => {
        const completed = week.sessions.filter((s) => done.has(sessionKey(s))).length
        return (
          <details className="week" key={week.number} open={week.number === openWeek}>
            <summary>
              <span>
                <span className="week-name">Week {week.number}</span>
                {week.number === currentWeek && <span className="tag tag-now">This week</span>}
                {week.isCutback && <span className="tag">Easier week</span>}
                <br />
                <span className="week-meta">
                  {PHASES[week.phase]} · from {formatDate(week.startDate)}
                  {completed > 0 && ` · ${completed} of ${week.sessions.filter((s) => s.type !== 'Race').length} done`}
                </span>
              </span>
              <span className="week-km">{formatDistance(trainingKm(week), units)}</span>
            </summary>
            <WeekDays week={week} byZone={byZone} units={units} done={done} onDoneChange={onDoneChange} runs={runs} onOpenRun={onOpenRun} />
          </details>
        )
      })}
    </div>
  )
}
