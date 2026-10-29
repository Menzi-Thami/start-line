import { useState } from 'react'
import type { PlanWeek } from '../../lib/types'
import { sessionKey } from './plan-math'
import { weekEnd } from '../../lib/plan-runs'

interface Props {
  weeks: readonly PlanWeek[]
  raceDate: string
  today: string
  done: Set<string>
  additionalDates?: readonly string[]
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
 * A day opens its week in the list below. It opens on the month with today in it.
 */
export function PlanCalendar({ weeks, raceDate, today, done, additionalDates = [] }: Props) {
  const sessions = weeks.flatMap((w) => w.sessions.map((s) => ({ ...s, week: w.number })))
  const months = monthsBetween(weeks[0]?.startDate ?? today, raceDate)
  const start = Math.max(0, months.indexOf(monthOf(today)))
  const [index, setIndex] = useState(start)
  const month = months[Math.min(index, months.length - 1)] ?? monthOf(today)

  const first = utc(`${month}-01`)
  const lead = (first.getUTCDay() + 6) % 7
  const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]

  const openWeek = (week: number) => {
    const el = document.getElementById(`plan-week-${week}`)
    if (el instanceof HTMLDetailsElement) el.open = true
    el?.querySelector('summary')?.focus({ preventScroll: true })
    el?.scrollIntoView?.({ block: 'start' })
  }

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
      <div className="plan-calendar-grid" onKeyDown={(event) => {
        // Move among session days without taking over the page's vertical scrolling.
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
        const current = buttons.indexOf(event.target as HTMLButtonElement)
        if (current < 0) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)))
        buttons[next]?.focus()
      }}>
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
          const week = weeks.find((w) => w.startDate <= date && date <= weekEnd(w))
          const isRace = date === raceDate
          const ticked = day.length > 0 && day.every((s) => done.has(sessionKey(s)))
          const state = isRace ? 'race' : ticked ? 'done' : runs.length > 0 ? 'run' : day.length > 0 ? 'strength' : 'rest'
          const label = `${date.slice(8).replace(/^0/, '')} ${MONTH.format(utc(date)).split(' ')[0]}: ${isRace ? 'race day' : day.length ? day.map((s) => s.title).join(', ') : 'rest'}${ticked ? ', done' : ''}${additional ? `, ${additional} additional ${additional === 1 ? 'run' : 'runs'} logged` : ''}`
          const cls = `plan-calendar-day is-${state}${date === today ? ' is-today' : ''}${additional ? ' has-additional-run' : ''}`
          return day.length > 0 || (additional > 0 && week) ? (
            <button key={date} type="button" className={cls} aria-label={label} aria-current={date === today ? 'date' : undefined} onClick={() => openWeek(day[0]?.week ?? week!.number)}>
              {Number(date.slice(8))}
            </button>
          ) : (
            <span key={date} className={cls} aria-label={label} aria-current={date === today ? 'date' : undefined}>
              {Number(date.slice(8))}
            </span>
          )
        })}
      </div>
      <p className="field-help plan-calendar-key">Ringed days are sessions. An underline marks an additional logged run. Select a day to open its week.</p>
    </section>
  )
}
