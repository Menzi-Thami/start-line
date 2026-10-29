import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { RunsByDate } from '../../lib/plan-runs'
import type { PlanWeek } from '../../lib/types'
import { calendarDayState, moveCalendarFocus } from './calendar-day'

interface Props {
  week: PlanWeek
  done: Set<string>
  runs?: RunsByDate
  additionalDates?: readonly string[]
  activityDates?: readonly string[]
  today: string
  units: Units
  onSelectDate: (date: string) => void
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * The week at a glance, above its days: what it asks for (distance and runs), then its seven days as a strip. A day is
 * done once its sessions are ticked; recorded activities have a separate marker. Today is in volt; rest days are dim. All from the plan
 * and the runner's own ticks and runs, never made up.
 */
export function WeekGlance({ week, done, runs, additionalDates = [], activityDates = [], today, units, onSelectDate }: Props) {
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
      <ol className="week-strip" onKeyDown={moveCalendarFocus}>
        {days.map((date) => {
          const sessions = week.sessions.filter((s) => s.date === date)
          const ran = runs?.get(date)?.some((r) => r.kind !== 'Other') ?? false
          const additional = additionalDates.includes(date)
          const recorded = ran || additional || activityDates.includes(date)
          const state = calendarDayState(sessions, done, recorded, date, today)
          return (
            <li key={date} className={`week-day is-${state}${date === today ? ' is-today' : ''}${recorded ? ' has-activity' : ''}`}>
              <button type="button" className="week-day-button" aria-haspopup="dialog" aria-current={date === today ? 'date' : undefined} aria-label={`${formatDate(date, 'long')}: ${sessions.length ? sessions.map(s => s.title).join(', ') : 'rest'}${state === 'done' ? ', done' : state === 'missed' ? ', no completion recorded' : ''}${recorded ? ', activity recorded' : ''}`} onClick={() => onSelectDate(date)}>
                <span className="week-day-name">{formatDate(date, 'weekday').slice(0, 3)}</span>
                <span className="week-day-dot mono">{Number(date.slice(8))}</span>
                <span className="visually-hidden">
                  {sessions.length === 0 ? ', rest' : `, ${sessions.map((s) => s.title).join(', ')}`}
                  {state === 'done' ? ', done' : ''}
                  {additional ? ', additional run logged' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <p className="field-help calendar-day-key">Select a date to see planned and recorded sessions. An underline marks recorded activity.</p>
    </section>
  )
}
