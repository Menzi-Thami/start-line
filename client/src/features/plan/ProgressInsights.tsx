import './training-status.css'
import { useId, useState, type ReactNode } from 'react'
import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { ActivitySummary, PersonalBest, PlanWeek } from '../../lib/types'
import { milestonesFromRuns } from '../milestones/milestones'
import { VolumeChart } from './VolumeChart'
import type { dayStatus } from './training-status'
import { calendarDaysEnding, comparablePaceGroups, progressDistanceTotals, volumeWeeksInPeriod } from './progress-evidence'
import './progress-insights.css'

/**
 * Progress, simply: how far you ran against the plan, as two totals and one weekly chart. Everything else (your days, easy-run
 * pace, milestones and whatever the caller passes as `more`) waits behind one "More detail" row.
 */
export function ProgressInsights({ weeks, units, currentWeek, ran, runs, today, statusFor, onOpenDate, bests = [], onOpenRun, more }: {
  weeks: PlanWeek[]; units: Units; currentWeek: number | null; ran?: ReadonlyMap<number, number>; runs?: readonly ActivitySummary[]; today: string
  statusFor: (date: string) => ReturnType<typeof dayStatus>; onOpenDate: (date: string, trigger: HTMLButtonElement, period: number) => void
  bests?: readonly PersonalBest[]; onOpenRun?: (id: string) => void; more?: ReactNode
}) {
  const id = useId()
  const [period, setPeriod] = useState(() => { const requested = Number(new URLSearchParams(window.location.search).get('progressWeeks')); return requested === 4 || requested === 12 ? requested : 8 })
  const [focusedDate, setFocusedDate] = useState(() => new URLSearchParams(window.location.search).get('day') ?? today)
  // Coming back from a day opened in the calendar, the row it lives in is still open.
  const [moreOpen, setMoreOpen] = useState(() => new URLSearchParams(window.location.search).has('day'))
  const [group, setGroup] = useState('')
  const [point, setPoint] = useState(0)
  const days = calendarDaysEnding(today, period * 7)
  const groups = comparablePaceGroups(runs ?? [], days[0]!, today)
  const chosen = groups.find(item => item.label === group) ?? groups[0]
  const points = chosen?.records ?? []
  const active = points[Math.min(point, Math.max(0, points.length - 1))]
  const minimum = Math.min(...points.map(run => run.paceSecondsPerKm), 300) - 10
  const maximum = Math.max(...points.map(run => run.paceSecondsPerKm), 300) + 10
  const x = (index: number) => 25 + index * 550 / Math.max(1, points.length - 1)
  const y = (pace: number) => 20 + (pace - minimum) * 140 / (maximum - minimum)
  const visibleWeeks = volumeWeeksInPeriod(weeks, today, period)
  const milestones = milestonesFromRuns(runs ?? [])
  const totals = progressDistanceTotals(visibleWeeks, ran, today)
  // The calendar runs Monday to Sunday: the first date starts in its own weekday's column.
  const firstColumn = (new Date(`${days[0]}T12:00:00Z`).getUTCDay() + 6) % 7 + 1
  const upcoming = visibleWeeks.length > 0 && visibleWeeks[0]!.startDate > today
  const remember = (key: string, value: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set(key, value)
    window.history.replaceState(window.history.state, '', url)
  }
  const choosePeriod = (value: number) => {
    setPeriod(value)
    setPoint(0)
    const from = calendarDaysEnding(today, value * 7)[0]!
    setFocusedDate(date => date >= from && date <= today ? date : today)
    remember('progressWeeks', String(value))
  }
  return <section className="progress-insights" aria-label="Training progress">
    <div className="progress-period" role="group" aria-label="Progress period">{[4, 8, 12].map(value => <button type="button" className="chip-button" key={value} aria-pressed={period === value} onClick={() => choosePeriod(value)}>{value} weeks</button>)}</div>
    <dl className="progress-summary" aria-label="Progress summary">
      <div><dt>Planned</dt><dd><strong>{formatDistance(totals.plannedKm, units)}</strong><span>{upcoming ? 'Your plan hasn’t started yet.' : visibleWeeks.length === 1 ? 'In the first week of your plan.' : `In these ${visibleWeeks.length} weeks of your plan.`}</span></dd></div>
      <div><dt>You ran</dt><dd><strong>{totals.recordedKm === null ? '—' : formatDistance(totals.recordedKm, units)}</strong><span>{totals.recordedKm === null ? 'Log or sync a run and it shows here.' : `Across ${totals.recordedWeeks} of ${totals.elapsedWeeks} weeks so far.`}</span></dd></div>
    </dl>
    <section id={`${id}-distance`} className="panel progress-chart" aria-labelledby={`${id}-distance-heading`}>
      <h3 id={`${id}-distance-heading`}>Weekly distance</h3>
      <p className="field-help">What you ran against the plan, week by week.</p>
      {visibleWeeks.length > 0 ? <VolumeChart weeks={visibleWeeks} units={units} currentWeek={currentWeek} ran={ran} /> : <p>No plan weeks in this period yet.</p>}
    </section>

    <details className="disclosure progress-more" open={moreOpen} onToggle={event => setMoreOpen(event.currentTarget.open)}>
    <summary>More detail <span className="field-help">Your days, easy-run pace, milestones, paces and every week</span></summary>
    <section className="panel" aria-labelledby={`${id}-consistency`}><h3 id={`${id}-consistency`}>Your days</h3>
      <p className="field-help">Tap a day to see what was planned and what you ran.</p>
      <div className="consistency-weekdays" aria-hidden="true">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={index}>{day}</span>)}</div>
      <div className="consistency-calendar" role="group" aria-label="Training dates" onKeyDown={event => {
        const index = Math.max(0, days.indexOf(focusedDate))
        const delta = ({ ArrowRight: 1, ArrowLeft: -1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : delta != null ? Math.max(0, Math.min(days.length - 1, index + delta)) : -1
        if (next < 0) return
        event.preventDefault()
        setFocusedDate(days[next]!)
        document.getElementById(`${id}-${days[next]}`)?.focus()
      }}>{days.map((date, index) => {
        const status = statusFor(date)
        return <button type="button" key={date} data-date={date} id={`${id}-${date}`} tabIndex={date === focusedDate ? 0 : -1} style={index === 0 ? { gridColumnStart: firstColumn } : undefined} onFocus={() => setFocusedDate(date)} className={`consistency-date is-${status.kind}`} aria-label={`${formatDate(date, 'long')}: ${status.label}`} onClick={event => onOpenDate(date, event.currentTarget, period)}><span>{Number(date.slice(8))}</span><span aria-hidden="true">{status.icon}</span></button>
      })}</div>
      <p className="field-help">✓ Done · − Part done · ↗ Ran · • Planned · ○ Rest</p>
    </section>
    <section id={`${id}-pace`} className="panel progress-chart" aria-labelledby={`${id}-pace-heading`}><h3 id={`${id}-pace-heading`}>Easy-run pace</h3>
      <p className="field-help">Your easy runs of a similar distance, side by side. Higher is faster.</p>
      {groups.length ? <><label htmlFor={`${id}-group`}>Runs like</label><select className="input" id={`${id}-group`} value={chosen!.label} onChange={event => { setGroup(event.target.value); setPoint(0) }}>{groups.map(item => <option key={item.label}>{item.label}</option>)}</select>
        {points.length >= 2 ? <svg className="progress-pace-line" viewBox="0 0 600 180" role="slider" tabIndex={0} aria-valuemin={1} aria-valuemax={points.length} aria-valuenow={Math.min(point, points.length - 1) + 1} aria-valuetext={active ? `${formatDate(active.localDate)}: ${formatPace(active.paceSecondsPerKm, units)}` : undefined} aria-label={`Recorded pace across ${points.length} comparable runs; inspect exact values below`} onKeyDown={event => {
          const index = Math.min(point, points.length - 1)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : event.key === 'ArrowLeft' ? Math.max(0, index - 1) : event.key === 'ArrowRight' ? Math.min(points.length - 1, index + 1) : -1
          if (next >= 0) { event.preventDefault(); setPoint(next) }
        }}><path d={points.map((run, index) => `${index ? 'L' : 'M'}${x(index)},${y(run.paceSecondsPerKm)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="3" />{points.map((run, index) => <circle key={run.id} onClick={() => setPoint(index)} cx={x(index)} cy={y(run.paceSecondsPerKm)} r={index === Math.min(point, points.length - 1) ? 8 : 5} fill={index === Math.min(point, points.length - 1) ? 'var(--accent)' : 'var(--ink)'} />)}</svg> : <p>One easy run so far. Two or more make a line.</p>}
        <label htmlFor={`${id}-point`}>Inspect a run</label><select className="input" id={`${id}-point`} value={Math.min(point, points.length - 1)} onChange={event => setPoint(Number(event.target.value))}>{points.map((run, index) => <option key={run.id} value={index}>{formatDate(run.localDate)} · {formatPace(run.paceSecondsPerKm, units)}</option>)}</select>
        {active && <p role="status">{formatDate(active.localDate, 'long')} · {formatDistance(active.distanceKm, units)} · {formatPace(active.paceSecondsPerKm, units)} {onOpenRun && <button className="link-button" onClick={() => onOpenRun(active.id)}>Open this run</button>}</p>}
        <details><summary>Pace table</summary><table><thead><tr><th>Date</th><th>Distance</th><th>Pace</th></tr></thead><tbody>{points.map(run => <tr key={run.id}><th scope="row">{formatDate(run.localDate)}</th><td>{formatDistance(run.distanceKm, units)}</td><td>{formatPace(run.paceSecondsPerKm, units)}</td></tr>)}</tbody></table></details>
      </> : <p>No easy runs with a pace in these weeks yet.</p>}
    </section>
    <section aria-label="Running milestones"><h3>Milestones</h3><div className="progress-milestones">{milestones.length ? milestones.map(item => <article className="panel" key={item.id}><h4>{item.title}</h4><strong>{item.unit === 'km' ? formatDistance(item.value, units) : `${item.value} weeks`}</strong><p>{item.detail}</p></article>) : <p>Add a run and your milestones start here.</p>}</div></section>
    {bests.length > 0 && <section aria-label="Personal best records"><h3>Personal bests</h3><ul className="progress-personal-bests">{bests.filter(best => [1000, 5000, 10000, 21097.5, 42195].includes(best.distanceMetres)).map(best => <li key={`${best.distanceMetres}-${best.activityId}`}>{best.name} · {formatDuration(best.seconds)} · {formatDate(best.localDate)} · {best.source}{onOpenRun && <button type="button" className="link-button" onClick={() => onOpenRun(best.activityId)}>View record run</button>}</li>)}</ul></section>}
    {more}
    </details>
  </section>
}
