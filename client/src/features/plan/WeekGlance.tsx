import type { dayStatus } from './training-status'
import type { ReactNode } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { RunsByDate } from '../../lib/plan-runs'
import type { PlanWeek } from '../../lib/types'
import { useMoveDrag } from './useMoveDrag'
import { calendarDayState, moveCalendarFocus } from './calendar-day'
import { isStrength } from '../../lib/strength'
import { WorkoutArtwork } from '../shared/WorkoutArtwork'

interface Props {
  statusFor?: (date: string) => ReturnType<typeof dayStatus>
  onRequestMove?: (from: string, to?: string) => void
  /** Days a run can be moved from and to (move-window.ts); without them, any day from today. */
  canMoveFrom?: (date: string) => boolean
  canMoveTo?: (date: string) => boolean
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
 * The week at a glance: what it asks for (distance and runs), then seven large dated workout rows. A day is
 * done once its sessions are ticked; recorded activities have a separate marker. Today is in volt; rest days are dim. All from the plan
 * and the runner's own ticks and runs, never made up.
 */
export function WeekGlance({ week, done, runs, additionalDates = [], activityDates = [], today, units, onSelectDate, selectedDate, daySummaryId, renderSelectedDay, statusFor, onRequestMove, canMoveFrom = (date: string) => date >= today, canMoveTo = (date: string) => date >= today }: Props) {
  const drag = useMoveDrag(date => !!onRequestMove && canMoveTo(date), onRequestMove)
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
          // The day's title is its run; strength on the same day is its own tag, never joined into the run's name.
          const dayRuns = sessions.filter(session => !isStrength(session))
          const ran = runs?.get(date)?.some((r) => r.kind !== 'Other') ?? false
          const additional = additionalDates.includes(date)
          const recorded = ran || additional || activityDates.includes(date)
          const state = calendarDayState(sessions, done, recorded, date, today)
          const status = statusFor?.(date)
          const movable = !!onRequestMove && canMoveFrom(date) && sessions.some(s => s.type !== 'Strength' && s.type !== 'Race')
          return (
            <li key={date} className={`week-day is-${status?.kind === 'complete' ? 'done' : status?.kind === 'partial' ? 'partial' : status && state === 'done' ? 'ahead' : state}${date === today ? ' is-today' : ''}${recorded ? ' has-activity' : ''}${movable ? ' has-move' : ''}`}>
              <button type="button" className="week-day-button" data-date={date} draggable={movable} {...drag.day(date)} aria-pressed={date === selectedDate} aria-controls={date === selectedDate ? daySummaryId : undefined} data-selected={date === selectedDate} aria-current={date === today ? 'date' : undefined} onClick={event => onSelectDate(date, event.currentTarget)}>
                <span className="visually-hidden">{formatDate(date, 'long')}: </span>
                <WorkoutArtwork session={dayRuns[0] ?? sessions[0]} outside={status?.kind === 'outside'} />
                <span className="week-day-workout"><span className="workout-day-label"><span className="week-day-name">{formatDate(date, 'weekday')}</span><span className="week-day-dot mono">{Number(date.slice(8))}</span>{date === today && <span className="workout-current">Today</span>}</span><strong>{dayRuns.length ? dayRuns.map(session => session.title).join(' + ') : sessions.length ? sessions.map(session => session.title).join(' + ') : status?.kind === 'outside' ? 'Outside this plan' : 'Rest day'}</strong>{dayRuns.length > 0 && dayRuns.length < sessions.length && <span className="chip chip-good week-day-strength">+ Strength</span>}<span className="field-help">{sessions.filter(session => session.distanceKm > 0).map(session => formatDistance(session.distanceKm, units)).join(' + ')}{recorded ? ' · Activity recorded' : state === 'done' ? ' · Complete' : state === 'missed' ? ' · Not logged' : ''}</span><span className={`training-status is-${status?.kind ?? 'planned'}`} aria-label={status?.label}>{status?.icon ?? '•'}<span className="week-status-label"> {status?.label ?? 'Scheduled'}</span></span></span>
                {movable && <span className="schedule-drag-handle" aria-hidden="true" {...drag.handle(date)}>⠿</span>}
                <span className="visually-hidden">
                  {sessions.length === 0 ? (status?.kind === 'outside' ? ', outside this plan' : ', rest') : `, ${sessions.map((s) => s.title).join(', ')}`}
                  {state === 'done' ? ', done' : ''}
                  {additional ? ', additional run logged' : ''}
                </span>
              </button>
              {movable && <button type="button" className="link-button workout-move" aria-label={`Move ${dayRuns.map(session => session.title).join(' + ')} from ${formatDate(date, 'long')}`} onClick={() => onRequestMove?.(date)}>Move</button>}
              {date === selectedDate && renderSelectedDay && <div className="week-inline-preview">{renderSelectedDay()}</div>}
            </li>
          )
        })}
      </ol>
      <div>
      <div className="narrow-date-navigation" aria-label="Select date with larger touch targets">
        <button type="button" className="button button-quiet" disabled={selectedDate === days[0]} onClick={event => onSelectDate(days[Math.max(0, days.indexOf(selectedDate ?? days[0]!) - 1)]!, event.currentTarget)}>← Previous day</button>
        <button type="button" className="button button-quiet" disabled={selectedDate === days[6]} onClick={event => onSelectDate(days[Math.min(6, days.indexOf(selectedDate ?? days[0]!) + 1)]!, event.currentTarget)}>Next day →</button>
      </div>
      {!days.includes(selectedDate ?? '') && renderSelectedDay?.()}
      </div>
      </div>
      <p className="field-help calendar-day-key">• Run · ○ Rest · ✓ Done. Tap a day to see it.</p>
      <section className="coming-up" aria-label="Upcoming workouts"><h3>Coming up</h3><ul>{week.sessions.filter(session => session.date > today).slice(0, 3).map(session => <li key={`${session.date}-${session.type}`}><span>{formatDate(session.date, 'dayMonth')}</span> <strong>{session.title}</strong>{session.distanceKm > 0 && <span>{formatDistance(session.distanceKm, units)}</span>}</li>)}</ul>{!week.sessions.some(session => session.date > today) && <p className="field-help">No upcoming sessions in this week.</p>}</section>
    </section>
  )
}
