import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { RunsByDate } from '../../lib/plan-runs'
import type { PlanWeek } from '../../lib/types'
import { sessionKey } from './plan-math'

interface Props {
  week: PlanWeek
  done: Set<string>
  runs?: RunsByDate
  today: string
  units: Units
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * The week at a glance, above its days: what it asks for (distance and runs), then its seven days as a strip. A day is
 * done once its sessions are ticked or a run was recorded on it; today is in volt; rest days are dim. All from the plan
 * and the runner's own ticks and runs, never made up.
 */
export function WeekGlance({ week, done, runs, today, units }: Props) {
  const runSessions = week.sessions.filter((s) => s.type !== 'Strength')
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.startDate, i))
  return (
    <section className="week-glance" aria-label={`Week ${week.number} at a glance`}>
      <div className="week-glance-figures">
        <p>
          <span className="mono week-glance-value">{formatDistance(week.plannedKm, units)}</span>
          <span className="field-help">planned</span>
        </p>
        <p>
          <span className="mono week-glance-value">{runSessions.length}</span>
          <span className="field-help">{runSessions.length === 1 ? 'run' : 'runs'}</span>
        </p>
      </div>
      <ol className="week-strip">
        {days.map((date) => {
          const sessions = week.sessions.filter((s) => s.date === date)
          const ran = runs?.get(date)?.some((r) => r.kind !== 'Other') ?? false
          // A recorded run can complete running work only. Strength needs its own session/set ticks.
          const completed = sessions.length > 0 && sessions.every((s) => done.has(sessionKey(s)) || (s.type !== 'Strength' && ran))
          const state = completed || (sessions.length === 0 && ran) ? 'done' : sessions.length === 0 ? 'rest' : date < today ? 'missed' : 'ahead'
          return (
            <li key={date} className={`week-day is-${state}${date === today ? ' is-today' : ''}`} aria-current={date === today ? 'date' : undefined}>
              <span className="week-day-name">{formatDate(date, 'weekday').slice(0, 3)}</span>
              <span className="week-day-dot mono">{Number(date.slice(8))}</span>
              <span className="visually-hidden">
                {sessions.length === 0 ? ', rest' : `, ${sessions.map((s) => s.title).join(', ')}`}
                {state === 'done' ? ', done' : ''}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
