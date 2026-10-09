import { useState } from 'react'
import { addDays, formatDate, formatDistance, formatPaceRange, type Units } from '../../lib/format'
import type { PaceZone, PaceZoneRange, PlanWeek, Session } from '../../lib/types'
import { PHASES, ZONES } from './copy'
import { Runner } from '../shared/Runner'
import { sessionKey, trainingKm } from './plan-math'

interface Props {
  weeks: PlanWeek[]
  paces: PaceZoneRange[]
  units: Units
  currentWeek: number | null
  done: Set<string>
  onToggleDone: (key: string, done: boolean) => void
}

function SessionItem({ session, pace, units, isDone, onToggle }: {
  session: Session
  pace: PaceZoneRange | undefined
  units: Units
  isDone: boolean
  onToggle: (done: boolean) => void
}) {
  // Counts ticks made here, so confetti bursts when a session is ticked, not every time a done one is shown.
  const [bursts, setBursts] = useState(0)
  const zone = session.zone ? ZONES[session.zone] : undefined
  const numbers = [
    session.distanceKm > 0 ? formatDistance(session.distanceKm, units) : null,
    pace && zone ? `${zone.name} ${formatPaceRange(pace.fastestSecondsPerKm, pace.slowestSecondsPerKm, units)}` : null,
  ].filter(Boolean)

  return (
    <div className={`session${isDone ? ' is-done' : ''}`}>
      <div className="session-head">
        {zone && <span className="effort-dot" style={{ background: zone.colour }} aria-hidden="true" />}
        <span className="session-title">{session.title}</span>
        {numbers.length > 0 && <span className="session-numbers">{numbers.join(' · ')}</span>}
      </div>
      <p className="session-detail">{session.detail}</p>
      <p className="session-why">Why: {session.purpose}</p>
      {session.type !== 'Race' && (
        <label className="session-done">
          <span className="tick-wrap">
            <input
              type="checkbox"
              checked={isDone}
              onChange={(e) => {
                if (e.target.checked) setBursts((n) => n + 1)
                onToggle(e.target.checked)
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
  onToggleDone: (key: string, done: boolean) => void
}

/** One week, every day listed, rest days included, so the shape of the week is obvious. */
export function WeekDays({ week, byZone, units, done, onToggleDone }: WeekDaysProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.startDate, i))
  return (
    <ol className="days">
      {days.map((date) => {
        const sessions = week.sessions.filter((s) => s.date === date)
        return (
          <li className="day" key={date}>
            <span className="day-date">
              {formatDate(date, 'weekday')}
              <small>{formatDate(date, 'dayMonth')}</small>
            </span>
            {sessions.length === 0 ? (
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
                    isDone={done.has(sessionKey(s))}
                    onToggle={(d) => onToggleDone(sessionKey(s), d)}
                  />
                ))}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Every week as a disclosure, every day of the week listed, rest days included, so the shape of the week is obvious. */
export function WeekList({ weeks, paces, units, currentWeek, done, onToggleDone }: Props) {
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
            <WeekDays week={week} byZone={byZone} units={units} done={done} onToggleDone={onToggleDone} />
          </details>
        )
      })}
    </div>
  )
}
