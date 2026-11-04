import type { dayStatus } from './training-status'
import type { ReactNode } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { RunsByDate } from '../../lib/plan-runs'
import type { PlanWeek } from '../../lib/types'
import { calendarDayState, moveCalendarFocus } from './calendar-day'

interface Props {
  statusFor?: (date: string) => ReturnType<typeof dayStatus>
  week: PlanWeek
  done: Set<string>
  runs?: RunsByDate
  additionalDates?: readonly string[]
  activityDates?: readonly string[]
  today: string
  units: Units
  onSelectDate: (date: string, trigger: HTMLButtonElement) => void
  selectedDate?: string | null
  renderSelectedDay?: () => ReactNode
  daySummaryId?: string
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
export function WeekGlance({ week, done, runs, additionalDates = [], activityDates = [], today, units, onSelectDate, selectedDate, daySummaryId, renderSelectedDay, statusFor }: Props) {
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
      <div className="week-master-detail">
      <ol className="week-strip week-agenda" onKeyDown={moveCalendarFocus}>
        {days.map((date) => {
          const sessions = week.sessions.filter((s) => s.date === date)
          const ran = runs?.get(date)?.some((r) => r.kind !== 'Other') ?? false
          const additional = additionalDates.includes(date)
          const recorded = ran || additional || activityDates.includes(date)
          const state = calendarDayState(sessions, done, recorded, date, today)
          const status = statusFor?.(date)
          return (
            <li key={date} className={`week-day is-${state}${date === today ? ' is-today' : ''}${recorded ? ' has-activity' : ''}`}>
              <button type="button" className="week-day-button" data-date={date} aria-pressed={date === selectedDate} aria-controls={date === selectedDate ? daySummaryId : undefined} data-selected={date === selectedDate} aria-current={date === today ? 'date' : undefined} aria-label={`${formatDate(date, 'long')}: ${sessions.length ? sessions.map(s => s.title).join(', ') : 'rest'}${state === 'done' ? ', done' : state === 'missed' ? ', no completion recorded' : ''}${recorded ? ', activity recorded' : ''}`} onClick={event => onSelectDate(date, event.currentTarget)}>
                <span className="week-day-name">{formatDate(date, 'weekday').slice(0, 3)}</span>
                <span className="week-day-dot mono">{Number(date.slice(8))}</span>
                <span className="week-day-workout"><strong>{sessions.length ? sessions.map(session => session.title).join(' + ') : 'Rest day'}</strong><span className="field-help">{sessions.filter(session => session.distanceKm > 0).map(session => formatDistance(session.distanceKm, units)).join(' + ')}{recorded ? ' · Activity recorded' : state === 'done' ? ' · Complete' : state === 'missed' ? ' · Not logged' : ''}</span></span>
                <span className={`training-status is-${status?.kind ?? 'planned'}`} aria-label={status?.label}>{status?.icon ?? '•'}<span className="week-status-label"> {status?.label ?? 'Scheduled'}</span></span>
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
      <div>
      <div className="narrow-date-navigation" aria-label="Select date with larger touch targets">
        <button type="button" className="button button-quiet" disabled={selectedDate === days[0]} onClick={event => onSelectDate(days[Math.max(0, days.indexOf(selectedDate ?? days[0]!) - 1)]!, event.currentTarget)}>← Previous day</button>
        <button type="button" className="button button-quiet" disabled={selectedDate === days[6]} onClick={event => onSelectDate(days[Math.min(6, days.indexOf(selectedDate ?? days[0]!) + 1)]!, event.currentTarget)}>Next day →</button>
      </div>
      {renderSelectedDay?.()}
      </div>
      </div>
      <p className="field-help calendar-day-key">Select a date to preview it, then open day details.</p>
      <section className="coming-up" aria-label="Upcoming workouts"><h3>Coming up</h3><ul>{week.sessions.filter(session => session.date > today).slice(0, 3).map(session => <li key={`${session.date}-${session.type}`}><span>{formatDate(session.date, 'dayMonth')}</span> <strong>{session.title}</strong>{session.distanceKm > 0 && <span>{formatDistance(session.distanceKm, units)}</span>}</li>)}</ul>{!week.sessions.some(session => session.date > today) && <p className="field-help">No upcoming sessions in this week.</p>}</section>
    </section>
  )
}
