import type { dayStatus } from './training-status'
import { useState } from 'react'
import type { PlanWeek } from '../../lib/types'
import { calendarDayState, moveCalendarFocus } from './calendar-day'
import { formatDistance, type Units } from '../../lib/format'

interface Props {
  /** For the workout named in each day on wide screens. */
  units?: Units
  statusFor?: (date: string) => ReturnType<typeof dayStatus>
  weeks: readonly PlanWeek[]
  raceDate: string
  today: string
  done: Set<string>
  additionalDates?: readonly string[]
  activityDates?: readonly string[]
  historyDates?: readonly string[]
  onSelectDate: (date: string, trigger: HTMLButtonElement) => void
  selectedDate?: string | null
  daySummaryId?: string
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const monthOf = (date: string) => date.slice(0, 7)

/** The months a plan spans, first to last: "2026-10", "2026-11", … */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  const d = utc(`${monthOf(from)}-01`)
  while (iso(d).slice(0, 7) <= monthOf(to)) {
    months.push(iso(d).slice(0, 7))
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return months
}

/**
 * The whole plan as a calendar, a month at a time: run days ringed, ticked ones in volt, today filled, race day flagged.
 * Every date opens its day summary, including rest days. It opens on today's month.
 */
export function PlanCalendar({ units = 'km', weeks, raceDate, today, done, additionalDates = [], activityDates = [], historyDates = [], onSelectDate, selectedDate, daySummaryId, statusFor }: Props) {
  const sessions = weeks.flatMap((w) => w.sessions)
  const firstDate = [weeks[0]?.startDate ?? today, ...historyDates].sort()[0]!
  const lastDate = [raceDate, ...historyDates].sort().at(-1)!
  const months = monthsBetween(firstDate, lastDate)
  const start = Math.max(0, months.indexOf(monthOf(today)))
  const [index, setIndex] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('month')
    const requestedIndex = requested ? months.indexOf(requested) : -1
    return requestedIndex >= 0 ? requestedIndex : start
  })
  const month = months[Math.min(index, months.length - 1)] ?? monthOf(today)

  const first = utc(`${month}-01`)
  const lead = (first.getUTCDay() + 6) % 7
  const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]

  return (
    <section className="plan-calendar" aria-label="Your plan by month">
      <div className="plan-calendar-head">
        <button type="button" className="plan-calendar-nav" aria-label="Previous month" disabled={index <= 0} onClick={() => setIndex((i) => i - 1)}>
          ‹
        </button>
        <h3 aria-live="polite">{MONTH.format(first)}</h3>
        <button type="button" className="plan-calendar-nav" aria-label="Next month" disabled={index >= months.length - 1} onClick={() => setIndex((i) => i + 1)}>
          ›
        </button>
      </div>
      <div className="plan-calendar-grid" onKeyDown={moveCalendarFocus}>
        {DAYS.map((d) => (
          <span key={d} className="plan-calendar-dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`gap-${i}`} aria-hidden="true" />
          const day = sessions.filter((s) => s.date === date)
          const runs = day.filter((s) => s.type !== 'Strength')
          const additional = additionalDates.filter((d) => d === date).length
          const isRace = date === raceDate
          const recorded = activityDates.includes(date) || additional > 0
          const status = statusFor?.(date)
          const completion = calendarDayState(day, done, recorded, date, today)
          const state = isRace ? 'race' : status?.kind === 'complete' ? 'done' : status?.kind === 'partial' ? 'partial' : !status && completion === 'done' ? 'done' : runs.length > 0 ? 'run' : day.length > 0 ? 'strength' : 'rest'
          const inPlan = date >= (weeks[0]?.startDate ?? today) && date <= raceDate
          const label = `${date.slice(8).replace(/^0/, '')} ${MONTH.format(utc(date)).split(' ')[0]}: ${isRace ? 'race day' : day.length ? day.map((s) => s.title).join(', ') : inPlan ? 'rest' : 'outside this plan'}${status ? `, ${status.label.toLowerCase()}` : completion === 'done' ? ', done' : completion === 'missed' ? ', no completion recorded' : ''}${recorded ? ', activity recorded' : ''}${additional ? `, ${additional} additional ${additional === 1 ? 'run' : 'runs'} logged` : ''}`
          const cls = `plan-calendar-day is-${state}${completion === 'missed' ? ' is-missed' : ''}${date === today ? ' is-today' : ''}${recorded ? ' has-activity' : ''}`
          return (
            <button key={date} data-date={date} type="button" className={cls} data-status={status?.kind} aria-label={label} aria-pressed={date === selectedDate} aria-controls={date === selectedDate ? daySummaryId : undefined} aria-current={date === today ? 'date' : undefined} onClick={event => onSelectDate(date, event.currentTarget)}>
              {Number(date.slice(8))}
              {status && <span className="calendar-status" aria-hidden="true">{status.icon}</span>}
              {(isRace || day.length > 0) && <span className="calendar-what" aria-hidden="true">{isRace ? 'Race day' : day.map(s => s.type === 'Strength' ? 'Strength' : `${s.title}${s.distanceKm > 0 ? ` · ${formatDistance(s.distanceKm, units)}` : ''}`).join(' + ')}</span>}
            </button>
          )
        })}
      </div>
      <p className="field-help plan-calendar-key">✓ Completed · − Cut short · ↗ Activity recorded · • Scheduled · ○ Rest. Select a date to preview it, then open day details.</p>
    </section>
  )
}
