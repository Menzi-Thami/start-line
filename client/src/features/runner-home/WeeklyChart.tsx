import { useRef, useState } from 'react'
import { formatDate, formatDistance, type Units } from '../../lib/format'
import type { WeekBar } from './home-math'

/** The last twelve weeks, run against planned, as bars; a table carries the numbers for screen readers. */
export function WeeklyChart({ bars, units, averageKm }: { bars: WeekBar[]; units: Units; averageKm: number }) {
  const [selected, setSelected] = useState<number | null>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const active = selected === null ? null : Math.min(selected, bars.length - 1)
  const describe = (bar: WeekBar) => `Week of ${formatDate(bar.weekStart, 'dayMonth')}: ${formatDistance(bar.km, units)} run${bar.plannedKm == null ? ', no plan for this week' : `, ${formatDistance(bar.plannedKm, units)} planned`}`
  const max = Math.max(10, ...bars.map((b) => Math.max(b.km, b.plannedKm ?? 0)))
  const share = (km: number) => `${(km / max) * 100}%`
  return (
    <figure className="home-chart">
      <div className="home-bars" role="group" aria-label="Explore weekly running">
        {bars.map((bar, i) => (
          <button type="button" key={bar.weekStart} ref={(el) => { buttons.current[i] = el }} className={`home-bar${i === bars.length - 1 ? ' home-bar-now' : ''}${active === i ? ' is-selected' : ''}`}
            aria-label={describe(bar)} aria-pressed={active === i} tabIndex={i === (active ?? bars.length - 1) ? 0 : -1}
            onClick={() => setSelected(active === i ? null : i)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { setSelected(null); buttons.current.at(-1)?.focus(); return }
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? bars.length - 1 : Math.max(0, Math.min(bars.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)))
              setSelected(next)
              buttons.current[next]?.focus()
            }}>
            {bar.plannedKm != null && <span className="home-bar-planned" style={{ height: share(bar.plannedKm) }} />}
            <span className="home-bar-ran" style={{ height: share(bar.km) }} />
          </button>
        ))}
        {averageKm > 0 && <span className="home-chart-average" aria-hidden="true" style={{ bottom: share(averageKm) }} />}
      </div>
      <p className="home-chart-detail" role="status">{active !== null && bars[active] ? describe(bars[active]) : 'Select a week, or use the arrow keys, to compare run and planned distance.'}</p>
      <div className="home-bar-labels" aria-hidden="true">
        {bars.map((bar, i) => (
          <span key={bar.weekStart}>{(bars.length - 1 - i) % 3 === 0 ? formatDate(bar.weekStart, 'dayMonth') : ''}</span>
        ))}
      </div>
      <figcaption className="field-help">
        Bars: ticked and uploaded runs. Outline: planned. Line: 4-week average.
      </figcaption>
      <table className="visually-hidden">
        <caption>Weekly distance, last 12 weeks</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Ran</th>
            <th scope="col">Planned</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.weekStart}>
              <td>{formatDate(bar.weekStart, 'dayMonth')}</td>
              <td>{formatDistance(bar.km, units)}</td>
              <td>{bar.plannedKm == null ? '–' : formatDistance(bar.plannedKm, units)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

