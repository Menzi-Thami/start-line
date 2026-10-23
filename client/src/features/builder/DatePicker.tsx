import { useEffect, useRef, useState } from 'react'
import { addDays, formatDate } from '../../lib/format'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
const monthShort = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

const at = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** The first of the month an ISO date falls in, as "yyyy-mm-01". */
const monthOf = (iso: string) => `${iso.slice(0, 7)}-01`

function shiftMonth(first: string, by: number): string {
  const date = at(first)
  date.setUTCMonth(date.getUTCMonth() + by)
  return date.toISOString().slice(0, 10)
}

/** The last day of the month that starts on <paramref name="first"/>. */
const lastOf = (first: string) => addDays(shiftMonth(first, 1), -1)

/** Every day shown for a month: whole weeks, Monday to Sunday, padded with the neighbouring months' days. */
function monthGrid(first: string): string[][] {
  const lead = (at(first).getUTCDay() + 6) % 7
  const start = addDays(first, -lead)
  const weeks: string[][] = []
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d))
    if (w > 3 && week[0]!.slice(0, 7) !== first.slice(0, 7)) break
    weeks.push(week)
  }
  return weeks
}

const Chevron = ({ to }: { to: 'left' | 'right' | 'down' }) => (
  <svg className="datepick-chevron" viewBox="0 0 20 20" aria-hidden="true">
    <path d={to === 'left' ? 'M12.5 4.5 7 10l5.5 5.5' : to === 'right' ? 'M7.5 4.5 13 10l-5.5 5.5' : 'M5 7.5l5 5 5-5'} />
  </svg>
)

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
 * Sunday like the plan's own; the month's name opens the year, to jump months at a time. On a phone it rises as a sheet
 * from the bottom of the screen. Days outside <paramref name="min"/>–<paramref name="max"/> can't be picked. Escape or
 * a tap outside closes it; the button keeps the field's label, so it reads as "Race date, Sunday 13 December 2026".
 */
export function DatePicker({ id, value, onChange, min, max, today, invalid, describedBy }: Props) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'days' | 'months'>('days')
  const [month, setMonth] = useState(() => monthOf(value || (min && min > today ? min : today)))
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // A month opened near the bottom of the screen scrolls up into view, clear of the sticky Back and Continue.
    panel.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
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
  const monthAllowed = (first: string) => (!min || lastOf(first) >= min) && (!max || first <= max)
  const year = Number(month.slice(0, 4))
  const yearAllowed = (y: number) => (!min || y >= Number(min.slice(0, 4))) && (!max || y <= Number(max.slice(0, 4)))
  const step = view === 'days' ? { back: shiftMonth(month, -1), on: shiftMonth(month, 1) } : { back: shiftMonth(month, -12), on: shiftMonth(month, 12) }
  const canGoBack = view === 'days' ? monthAllowed(step.back) : yearAllowed(year - 1)
  const canGoOn = view === 'days' ? monthAllowed(step.on) : yearAllowed(year + 1)
  const unit = view === 'days' ? 'month' : 'year'

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
          if (!open) {
            setMonth(monthOf(value || (min && min > today ? min : today)))
            setView('days')
          }
          setOpen(!open)
        }}
      >
        <span id={`${id}-value`} className="visually-hidden">
          {value ? formatDate(value, 'long') : 'Choose a day'}
        </span>
        <span className="datepick-text" aria-hidden="true">
          {value ? (
            <>
              <span className="datepick-dow">{formatDate(value, 'weekday')}</span>
              <span className="datepick-date">{shortDate.format(at(value))}</span>
            </>
          ) : (
            'Choose a day'
          )}
        </span>
        <svg className="datepick-icon" viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" />
          <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
        </svg>
      </button>

      {open && (
        <>
          <div className="datepick-scrim" aria-hidden="true" onClick={close} />
          <div ref={panel} className="datepick-panel" role="dialog" aria-label="Choose a date">
            <span className="datepick-grab" aria-hidden="true" />
            <div className="datepick-head">
              <button
                type="button"
                className="datepick-title"
                aria-expanded={view === 'months'}
                aria-label={view === 'days' ? undefined : `Back to ${monthName.format(at(month))} ${year}`}
                onClick={() => setView(view === 'days' ? 'months' : 'days')}
              >
                <span aria-live="polite">{view === 'days' ? `${monthName.format(at(month))} ${year}` : year}</span>
                <Chevron to="down" />
              </button>
              <button type="button" className="datepick-nav" aria-label={`Previous ${unit}`} disabled={!canGoBack} onClick={() => setMonth(step.back)}>
                <Chevron to="left" />
              </button>
              <button type="button" className="datepick-nav" aria-label={`Next ${unit}`} disabled={!canGoOn} onClick={() => setMonth(step.on)}>
                <Chevron to="right" />
              </button>
            </div>

            {view === 'months' ? (
              <div className="datepick-months">
                {Array.from({ length: 12 }, (_, m) => {
                  const first = `${year}-${String(m + 1).padStart(2, '0')}-01`
                  const classes = ['datepick-month', first === month ? 'is-selected' : '', first === monthOf(today) ? 'is-today' : ''].filter(Boolean)
                  return (
                    <button
                      key={first}
                      type="button"
                      className={classes.join(' ')}
                      aria-label={`${monthName.format(at(first))} ${year}`}
                      disabled={!monthAllowed(first)}
                      onClick={() => {
                        setMonth(first)
                        setView('days')
                      }}
                    >
                      {monthShort.format(at(first))}
                    </button>
                  )
                })}
              </div>
            ) : (
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
                      // Days from the months either side stay blank, so the month reads as one block.
                      if (day.slice(0, 7) !== month.slice(0, 7)) return <span role="gridcell" key={day} />
                      const classes = ['datepick-day', day === today ? 'is-today' : '', day === value ? 'is-selected' : ''].filter(Boolean)
                      return (
                        <span role="gridcell" key={day}>
                          <button
                            type="button"
                            className={classes.join(' ')}
                            aria-label={formatDate(day, 'long')}
                            aria-pressed={day === value}
                            aria-current={day === today ? 'date' : undefined}
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
            )}
          </div>
        </>
      )}
    </div>
  )
}
