import { addDays, formatDate, formatDistance, formatPaceRange, type Units } from '../../lib/format'
import type { PaceZoneRange, PlanWeek, Session } from '../../lib/types'
import { PHASES, ZONES } from './copy'
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
          <input type="checkbox" checked={isDone} onChange={(e) => onToggle(e.target.checked)} />
          Done
        </label>
      )}
    </div>
  )
}

/** Every week as a disclosure, every day of the week listed, rest days included, so the shape of the week is obvious. */
export function WeekList({ weeks, paces, units, currentWeek, done, onToggleDone }: Props) {
  const byZone = new Map(paces.map((p) => [p.zone, p]))
  const openWeek = currentWeek ?? weeks[0]?.number

  return (
    <div className="weeks">
      {weeks.map((week) => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(week.startDate, i))
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
                      <span className="day-rest">Rest</span>
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
          </details>
        )
      })}
    </div>
  )
}
