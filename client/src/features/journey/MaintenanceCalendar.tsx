import { useState } from 'react'
import { addDays, formatDate } from '../../lib/format'
import type { MaintenancePlan } from './types'

/** A real four-week plan view. Unscheduled dates remain open, never falsely marked "rest" or completed. */
export function MaintenanceCalendar({ maintenance, today }: { maintenance: MaintenancePlan; today: string }) {
  const weeks = maintenance.weeks
  const currentWeek = Math.max(0, weeks.findIndex(week => today >= week.weekStart && today <= addDays(week.weekStart, 6)))
  const initial = weeks[currentWeek]?.sessions.some(session => session.date >= today)
    ? currentWeek : Math.min(currentWeek + 1, weeks.length - 1)
  const [index, setIndex] = useState(initial)
  const [selected, setSelected] = useState(today)
  const week = weeks[index]
  if (!week) return <p className="field-help">Your easy-running days will appear when the schedule refreshes.</p>
  const days = Array.from({ length: 7 }, (_, day) => addDays(week.weekStart, day))
  const chosen = days.includes(selected) ? selected : (days.includes(today) ? today : week.sessions.find(session => session.date >= today)?.date ?? days[0]!)
  const sessions = week.sessions.filter(session => session.date === chosen)
  const move = (next: number) => { setIndex(next); setSelected(weeks[next]!.weekStart) }
  return <section className="maintenance-calendar" aria-label="Easy-running calendar">
    <div className="maintenance-calendar-nav">
      <button type="button" className="button button-quiet" disabled={index === 0} onClick={() => move(index - 1)} aria-label="Previous easy-running week">←</button>
      <div><strong>Week {index + 1} of {weeks.length}</strong><p className="field-help">{formatDate(days[0]!, 'dayMonth')} – {formatDate(days[6]!, 'dayMonth')}</p></div>
      <button type="button" className="button button-quiet" disabled={index === weeks.length - 1} onClick={() => move(index + 1)} aria-label="Next easy-running week">→</button>
    </div>
    <ol className="maintenance-calendar-grid" aria-label="Choose a day">
      {days.map(date => {
        const daySessions = week.sessions.filter(session => session.date === date)
        const beforeStart = date < maintenance.startedOn
        return <li key={date}><button type="button" aria-pressed={chosen === date}
          aria-label={`${formatDate(date, 'weekday')} ${formatDate(date, 'dayMonth')}: ${beforeStart ? 'before this plan' : daySessions.length ? daySessions.map(session => session.title).join(' and ') + ', optional' : 'no run scheduled'}`}
          className={`maintenance-calendar-day${chosen === date ? ' is-selected' : ''}${date === today ? ' is-today' : ''}${daySessions.length ? ' has-session' : ''}`}
          onClick={() => setSelected(date)}>
          <span>{formatDate(date, 'weekday').slice(0, 3)}</span><strong>{Number(date.slice(-2))}</strong>
          <span aria-hidden="true" className="maintenance-calendar-dot">{daySessions.length ? '●' : '·'}</span>
        </button></li>
      })}
    </ol>
    <div className="maintenance-day-detail" aria-live="polite">
      <p className="plan-kicker">{formatDate(chosen, 'weekday')} · {formatDate(chosen, 'dayMonth')}</p>
      {chosen < maintenance.startedOn ? <p>This day is before your easy-running plan started.</p>
        : sessions.length ? <ul aria-label="Optional sessions for selected day">{sessions.map(session => <li key={session.kind}>
          <strong>{session.title}</strong> <span className="mono">{session.minMinutes}–{session.maxMinutes} min</span>
          <p>{session.guidance}</p><span className="field-help">Optional · no run needs ticking off</span>
        </li>)}</ul> : <p>Free day. Nothing is scheduled or missed.</p>}
    </div>
    <p className="field-help">Your next four weeks, at your own pace. If you just raced, give yourself time before returning to running. You can skip any day; this calendar does not yet move sessions or mark them complete.</p>
  </section>
}
