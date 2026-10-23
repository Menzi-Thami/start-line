import { useEffect, useRef, useState } from 'react'
import { addDays, formatDate } from '../../lib/format'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

const monthTitle = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The first of the month an ISO date falls in, as "yyyy-mm-01". */
const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`

function shiftMonth(first: string, by: number): string {
  const date = new Date(`${first}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + by)
  return date.toISOString().slice(0, 10)
}

/** Every day shown for a month: whole weeks, Monday to Sunday, padded with the neighbouring months' days. */
function monthGrid(first: string): string[][] {
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7
  const start = addDays(first, -lead)
  const weeks: string[][] = []
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d))
    if (w > 3 && week[0]!.slice(0, 7) !== first.slice(0, 7)) break
    weeks.push(week)
  }
  return weeks
}

interface Props {
  id: string
  /** "yyyy-mm-dd", or "" before one is chosen. */
  value: string
  onChange: (value: string) => void
  /** Earliest and latest days that can be picked, as "yyyy-mm-dd". */
  min?: string
  max?: string
  /** The month to open on before anything is chosen. */
  today: string
  invalid?: boolean
  describedBy?: string
}

/**
 * A date as a drop-down calendar: the button shows the chosen day and opens a month to pick from, weeks Monday to
 * Sunday like the plan's own. Days outside <paramref name="min"/>–<paramref name="max"/> can't be picked. Escape or a
 * tap outside closes it; the button keeps the field's label, so it reads as "Race date, Sunday 13 December 2026".
 */
export function DatePicker({ id, value, onChange, min, max, today, invalid, describedBy }: Props) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => monthOf(value || (min && min > today ? min : today)))
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const close = () => {
    setOpen(false)
    button.current?.focus()
  }

  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max)
  const canGoBack = !min || shiftMonth(month, -1) >= monthOf(min)
  const canGoOn = !max || shiftMonth(month, 1) <= monthOf(max)

  return (
    <div className="datepick" ref={root} onKeyDown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), close())}>
      <button
        ref={button}
        id={id}
        type="button"
        className={`input datepick-button${value ? '' : ' is-empty'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={[`${id}-value`, describedBy].filter(Boolean).join(' ')}
        onClick={() => {
          if (!open) setMonth(monthOf(value || (min && min > today ? min : today)))
          setOpen(!open)
        }}
      >
        <span id={`${id}-value`}>{value ? formatDate(value, 'long') : 'Choose a day'}</span>
        <svg className="datepick-icon" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
          <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
        </svg>
      </button>

      {open && (
        <div className="datepick-panel" role="dialog" aria-label="Choose a date">
          <div className="datepick-head">
            <button type="button" className="datepick-nav" aria-label="Previous month" disabled={!canGoBack} onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </button>
            <span className="datepick-month" aria-live="polite">
              {monthTitle.format(new Date(`${month}T00:00:00Z`))}
            </span>
            <button type="button" className="datepick-nav" aria-label="Next month" disabled={!canGoOn} onClick={() => setMonth(shiftMonth(month, 1))}>
              ›
            </button>
          </div>
          <div className="datepick-grid" role="grid">
            <div className="datepick-row" role="row">
              {WEEKDAYS.map((d) => (
                <span key={d} className="datepick-weekday" role="columnheader">
                  {d}
                </span>
              ))}
            </div>
            {monthGrid(month).map((week) => (
              <div className="datepick-row" role="row" key={week[0]}>
                {week.map((day) => {
                  const classes = [
                    'datepick-day',
                    day.slice(0, 7) !== month.slice(0, 7) ? 'is-outside' : '',
                    day === today ? 'is-today' : '',
                    day === value ? 'is-selected' : '',
                  ].filter(Boolean)
                  return (
                    <span role="gridcell" key={day}>
                      <button
                        type="button"
                        className={classes.join(' ')}
                        aria-label={formatDate(day, 'long')}
                        aria-pressed={day === value}
                        disabled={!allowed(day)}
                        onClick={() => {
                          onChange(day)
                          close()
                        }}
                      >
                        {Number(day.slice(8))}
                      </button>
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
