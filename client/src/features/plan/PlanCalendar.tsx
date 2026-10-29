import { useState } from 'react'
import type { PlanWeek } from '../../lib/types'
import { calendarDayState, moveCalendarFocus } from './calendar-day'

interface Props {
  weeks: readonly PlanWeek[]
  raceDate: string
  today: string
  done: Set<string>
  additionalDates?: readonly string[]
  activityDates?: readonly string[]
  onSelectDate: (date: string) => void
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
export function PlanCalendar({ weeks, raceDate, today, done, additionalDates = [], activityDates = [], onSelectDate }: Props) {
  const sessions = weeks.flatMap((w) => w.sessions)
  const months = monthsBetween(weeks[0]?.startDate ?? today, raceDate)
  const start = Math.max(0, months.indexOf(monthOf(today)))
  const [index, setIndex] = useState(start)
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
          const completion = calendarDayState(day, done, recorded, date, today)
          const state = isRace ? 'race' : completion === 'done' ? 'done' : runs.length > 0 ? 'run' : day.length > 0 ? 'strength' : 'rest'
          const inPlan = date >= (weeks[0]?.startDate ?? today) && date <= raceDate
          const label = `${date.slice(8).replace(/^0/, '')} ${MONTH.format(utc(date)).split(' ')[0]}: ${isRace ? 'race day' : day.length ? day.map((s) => s.title).join(', ') : inPlan ? 'rest' : 'outside this plan'}${completion === 'done' ? ', done' : completion === 'missed' ? ', no completion recorded' : ''}${recorded ? ', activity recorded' : ''}${additional ? `, ${additional} additional ${additional === 1 ? 'run' : 'runs'} logged` : ''}`
          const cls = `plan-calendar-day is-${state}${completion === 'missed' ? ' is-missed' : ''}${date === today ? ' is-today' : ''}${recorded ? ' has-activity' : ''}`
          return (
            <button key={date} type="button" className={cls} aria-label={label} aria-haspopup="dialog" aria-current={date === today ? 'date' : undefined} onClick={() => onSelectDate(date)}>
              {Number(date.slice(8))}
            </button>
          )
        })}
      </div>
      <p className="field-help plan-calendar-key">Ringed days are sessions. An underline marks recorded activity. Select any date to see planned and recorded sessions.</p>
    </section>
  )
}
