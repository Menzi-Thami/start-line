import './training-status.css'
import { useId, useState } from 'react'
import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { ActivitySummary, PersonalBest, PlanWeek } from '../../lib/types'
import { milestonesFromRuns } from '../milestones/milestones'
import { VolumeChart } from './VolumeChart'
import type { dayStatus } from './training-status'
import { calendarDaysEnding, comparablePaceGroups, progressDistanceTotals, volumeWeeksInPeriod } from './progress-evidence'
import './progress-insights.css'

export function ProgressInsights({ weeks, units, currentWeek, ran, runs, today, statusFor, onOpenDate, bests = [], onOpenRun }: {
  weeks: PlanWeek[]; units: Units; currentWeek: number | null; ran?: ReadonlyMap<number, number>; runs?: readonly ActivitySummary[]; today: string
  statusFor: (date: string) => ReturnType<typeof dayStatus>; onOpenDate: (date: string, trigger: HTMLButtonElement, period: number) => void
  bests?: readonly PersonalBest[]; onOpenRun?: (id: string) => void
}) {
  const id = useId()
  const [period, setPeriod] = useState(() => { const requested = Number(new URLSearchParams(window.location.search).get('progressWeeks')); return requested === 4 || requested === 12 ? requested : 8 })
  const [focusedDate, setFocusedDate] = useState(() => new URLSearchParams(window.location.search).get('day') ?? today)
  const [metric, setMetric] = useState(() => new URLSearchParams(window.location.search).get('progressMetric') === 'pace' ? 'pace' : 'distance')
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
  const confirmedDays = days.filter(date => statusFor(date).kind === 'complete').length
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
  return <section className="progress-insights" aria-label="Training progress evidence">
    <div className="progress-period" role="group" aria-label="Progress period">{[4, 8, 12].map(value => <button type="button" className="chip-button" key={value} aria-pressed={period === value} onClick={() => choosePeriod(value)}>{value} weeks</button>)}</div>
    <dl className="progress-summary" aria-label="Progress summary">
      <div><dt>{upcoming ? 'Upcoming planned distance' : 'Planned distance'}</dt><dd><strong>{formatDistance(totals.plannedKm, units)}</strong><span>Across the plan weeks shown.</span></dd></div>
      <div><dt>Recorded or logged</dt><dd><strong>{totals.recordedKm === null ? 'Not available yet' : formatDistance(totals.recordedKm, units)}</strong><span>{totals.recordedKm === null ? 'No distance data for these plan weeks.' : `Available totals in ${totals.recordedWeeks} of ${totals.elapsedWeeks} shown plan weeks. Includes existing estimates.`}</span></dd></div>
      <div><dt>Confirmed days</dt><dd><strong>{confirmedDays}</strong><span>Days with every planned session confirmed in this period. Execution is assessed separately.</span></dd></div>
    </dl>
    <p className="field-help">Distances use the plan weeks shown; confirmed days cover the selected period. Source availability and cache limits still apply. An empty record does not prove you missed training.</p>
    <div className="progress-evidence-grid">
    <div className="progress-primary-chart">
      <div className="progress-metric" role="group" aria-label="Progress metric">{(['distance', 'pace'] as const).map(value => <button type="button" className="chip-button" key={value} aria-pressed={metric === value} aria-controls={`${id}-${value}`} onClick={() => { setMetric(value); remember('progressMetric', value) }}>{value === 'distance' ? 'Weekly distance' : 'Comparable pace'}</button>)}</div>
      <section id={`${id}-distance`} className="panel progress-chart" hidden={metric !== 'distance'} aria-labelledby={`${id}-distance-heading`}>
        <h3 id={`${id}-distance-heading`}>Weekly distance</h3>
        <p className="field-help">Planned versus recorded or logged distance. Zero means no distance in the currently available records, not a missed-workout verdict.</p>
        {visibleWeeks.length > 0 ? <>
          {upcoming && <p className="field-help">Your plan has not started yet. These bars show upcoming planned weeks, without implying any recorded training.</p>}
          <VolumeChart weeks={visibleWeeks} units={units} currentWeek={currentWeek} ran={ran} />
        </> : <p>No planned weeks fall in this period. Select comparable pace to explore available recordings.</p>}
      </section>
    <section id={`${id}-pace`} className="panel progress-chart" hidden={metric !== 'pace'} aria-labelledby={`${id}-pace-heading`}><h3 id={`${id}-pace-heading`}>Comparable pace</h3>
      <p className="field-help">Matched easy or recovery runs, grouped by workout type, approximate distance and recording source. Routes and conditions can still differ. Pace alone does not establish improving fitness. Higher on this chart is faster.</p>
      {groups.length ? <><label htmlFor={`${id}-group`}>Compare similar runs</label><select className="input" id={`${id}-group`} value={chosen!.label} onChange={event => { setGroup(event.target.value); setPoint(0) }}>{groups.map(item => <option key={item.label}>{item.label}</option>)}</select>
        {points.length >= 2 ? <svg className="progress-pace-line" viewBox="0 0 600 180" role="slider" tabIndex={0} aria-valuemin={1} aria-valuemax={points.length} aria-valuenow={Math.min(point, points.length - 1) + 1} aria-valuetext={active ? `${formatDate(active.localDate)}: ${formatPace(active.paceSecondsPerKm, units)}` : undefined} aria-label={`Recorded pace across ${points.length} comparable runs; inspect exact values below`} onKeyDown={event => {
          const index = Math.min(point, points.length - 1)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : event.key === 'ArrowLeft' ? Math.max(0, index - 1) : event.key === 'ArrowRight' ? Math.min(points.length - 1, index + 1) : -1
          if (next >= 0) { event.preventDefault(); setPoint(next) }
        }}><path d={points.map((run, index) => `${index ? 'L' : 'M'}${x(index)},${y(run.paceSecondsPerKm)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="3" />{points.map((run, index) => <circle key={run.id} onClick={() => setPoint(index)} cx={x(index)} cy={y(run.paceSecondsPerKm)} r={index === Math.min(point, points.length - 1) ? 8 : 5} fill={index === Math.min(point, points.length - 1) ? 'var(--accent)' : 'var(--ink)'} />)}</svg> : <p>One comparable run so far. A trend needs at least two.</p>}
        <label htmlFor={`${id}-point`}>Inspect a run</label><select className="input" id={`${id}-point`} value={Math.min(point, points.length - 1)} onChange={event => setPoint(Number(event.target.value))}>{points.map((run, index) => <option key={run.id} value={index}>{formatDate(run.localDate)} · {formatPace(run.paceSecondsPerKm, units)}</option>)}</select>
        {active && <p role="status">{formatDate(active.localDate, 'long')} · {formatDistance(active.distanceKm, units)} · {formatPace(active.paceSecondsPerKm, units)} {onOpenRun && <button className="link-button" onClick={() => onOpenRun(active.id)}>Open this run</button>}</p>}
        <details><summary>Comparable pace data</summary><table><thead><tr><th>Date</th><th>Distance</th><th>Pace</th></tr></thead><tbody>{points.map(run => <tr key={run.id}><th scope="row">{formatDate(run.localDate)}</th><td>{formatDistance(run.distanceKm, units)}</td><td>{formatPace(run.paceSecondsPerKm, units)}</td></tr>)}</tbody></table></details>
      </> : <p>No comparable easy or recovery recordings in this period. Unplanned and different workout types are not combined into a fitness trend.</p>}
    </section>
    </div>
    <section className="panel" aria-labelledby={`${id}-consistency`}><h3 id={`${id}-consistency`}>Training consistency</h3>
      <p className="field-help">Confirmed, partial and recorded sessions stay distinct. Select a date for its prescription and history.</p>
      <label htmlFor={`${id}-date`}>Find a training date</label><input className="input" id={`${id}-date`} type="date" min={days[0]} max={today} value={focusedDate} onChange={event => {
        const date = event.target.value
        if (date >= days[0]! && date <= today) { setFocusedDate(date); document.getElementById(`${id}-${date}`)?.focus() }
      }} />
      <div className="consistency-calendar" role="group" aria-label="Training dates" onKeyDown={event => {
        const index = Math.max(0, days.indexOf(focusedDate))
        const delta = ({ ArrowRight: 1, ArrowLeft: -1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? days.length - 1 : delta != null ? Math.max(0, Math.min(days.length - 1, index + delta)) : -1
        if (next < 0) return
        event.preventDefault()
        setFocusedDate(days[next]!)
        document.getElementById(`${id}-${days[next]}`)?.focus()
      }}>{days.map(date => {
        const status = statusFor(date)
        return <button type="button" key={date} data-date={date} id={`${id}-${date}`} tabIndex={date === focusedDate ? 0 : -1} onFocus={() => setFocusedDate(date)} className={`consistency-date is-${status.kind}`} aria-label={`${formatDate(date, 'long')}: ${status.label}`} onClick={event => onOpenDate(date, event.currentTarget, period)}><span>{Number(date.slice(8))}</span><span aria-hidden="true">{status.icon}</span></button>
      })}</div>
      <p className="field-help">✓ Confirmed · − Partial · ↗ Recorded · • Scheduled · ○ No session planned. Data unavailable in Taperday is not a missed-workout claim.</p>
    </section>
    </div>
    <section aria-label="Running milestones"><h3>Milestones in your records</h3><p className="field-help">Calculated from currently available recordings. Source expiry can change these values; they are not all-time record claims.</p><div className="progress-milestones">{milestones.length ? milestones.map(item => <article className="panel" key={item.id}><h4>{item.title}</h4><strong>{item.unit === 'km' ? formatDistance(item.value, units) : `${item.value} weeks`}</strong><p>{item.detail}</p></article>) : <p>Add a recorded run to start seeing milestones.</p>}</div></section>
    {bests.length > 0 && <section aria-label="Personal best records"><h3>Personal bests</h3><ul className="progress-personal-bests">{bests.filter(best => [1000, 5000, 10000, 21097.5, 42195].includes(best.distanceMetres)).map(best => <li key={`${best.distanceMetres}-${best.activityId}`}>{best.name} · {formatDuration(best.seconds)} · {formatDate(best.localDate)} · {best.source}{onOpenRun && <button type="button" className="link-button" onClick={() => onOpenRun(best.activityId)}>View record run</button>}</li>)}</ul></section>}
  </section>
}
