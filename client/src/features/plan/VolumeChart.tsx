import { useState, type CSSProperties } from 'react'
import { formatDistance, type Units } from '../../lib/format'
import type { PlanWeek } from '../../lib/types'
import { PHASES } from './copy'
import { trainingKm, weekLabels } from './plan-math'

interface Props {
  weeks: PlanWeek[]
  units: Units
  currentWeek: number | null
  /** Kilometres actually run in each week that has started, by week number. Without it, the chart shows the plan alone. */
  ran?: ReadonlyMap<number, number>
}

/** Above this many weeks the bars get too narrow for a number on each, so only this week and the biggest keep one. */
const LABEL_EVERY_BAR = 12

function niceMax(value: number): number {
  const step = value > 80 ? 20 : value > 40 ? 10 : 5
  return Math.max(step, Math.ceil(value / step) * step)
}

const number = (km: number, units: Units) => formatDistance(km, units).replace(` ${units}`, '')
const percent = (value: number, max: number) => `${Math.min(100, (value / max) * 100)}%`

/**
 * One series, one hue: weekly distance, as HTML bars in a plot of fixed height, so a four-week plan gets four
 * sensible bars rather than ones that fill the screen. Cutback weeks are hatched rather than recoloured, so the
 * difference survives colour blindness and printing; what was run sits inside its week's bar as a narrow ink bar, a
 * different shape as well as a different colour. The week list below doubles as the table view, and a visually
 * hidden table gives screen readers the same numbers.
 */
export function VolumeChart({ weeks, units, currentWeek, ran }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const values = weeks.map(trainingKm)
  const max = niceMax(Math.max(...values, ...(ran?.values() ?? []), 1))
  const biggest = values.indexOf(Math.max(...values))
  const labelled = weekLabels(weeks.length, currentWeek === null ? null : weeks.findIndex((w) => w.number === currentWeek) + 1)
  const selectedIndex = selected === null ? null : Math.min(selected, weeks.length - 1)
  const active = hover ?? selectedIndex
  const hovered = active === null ? undefined : weeks[active]
  const detail = hovered && active !== null
    ? `Week ${hovered.number}, ${PHASES[hovered.phase]}, ${formatDistance(values[active] ?? 0, units)} planned${ran?.has(hovered.number) ? `, ${formatDistance(ran.get(hovered.number) ?? 0, units)} run` : ''}`
    : null

  return (
    <figure className="volume">
      <div
        className={`volume-plot${weeks.length > LABEL_EVERY_BAR ? ' is-dense' : ''}`}
        role={weeks.length ? 'slider' : 'img'}
        aria-label={`Weekly distance over ${weeks.length} weeks, peaking at ${formatDistance(values[biggest] ?? 0, units)}. ${detail ?? 'Use arrow keys to explore individual weeks.'}`}
        aria-valuemin={weeks.length ? 1 : undefined}
        aria-valuemax={weeks.length || undefined}
        aria-valuenow={weeks.length ? (selectedIndex ?? 0) + 1 : undefined}
        aria-valuetext={detail ?? (weeks[0] ? `Week ${weeks[0].number}, ${formatDistance(values[0] ?? 0, units)} planned` : undefined)}
        tabIndex={weeks.length ? 0 : undefined}
        onKeyDown={(event) => {
          if (!weeks.length) return
          if (event.key === 'Escape') { setSelected(null); setHover(null); return }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
          event.preventDefault()
          setHover(null)
          const start = selectedIndex ?? Math.max(0, weeks.findIndex((w) => w.number === currentWeek))
          setSelected(event.key === 'Home' ? 0 : event.key === 'End' ? weeks.length - 1 : Math.max(0, Math.min(weeks.length - 1, start + (event.key === 'ArrowRight' ? 1 : -1))))
        }}
        style={{ ['--weeks' as string]: weeks.length } as CSSProperties}
        onPointerLeave={() => setHover(null)}
      >
        <div className="volume-grid" aria-hidden="true">
          {[max, max / 2, 0].map((tick) => (
            <span key={tick} className="volume-tick" style={{ bottom: percent(tick, max) }}>
              <span className="volume-tick-label mono">{tick === max ? formatDistance(tick, units) : number(tick, units)}</span>
            </span>
          ))}
        </div>

        <ol className="volume-bars" aria-hidden="true">
          {weeks.map((week, i) => {
            const km = values[i] ?? 0
            const ranKm = ran?.get(week.number)
            const isNow = currentWeek === week.number
            const showValue = weeks.length <= LABEL_EVERY_BAR || isNow || i === biggest
            const showWeek = labelled.has(i)
            return (
              <li
                key={week.number}
                className={`volume-week${isNow ? ' is-now' : ''}${week.isCutback ? ' is-cutback' : ''}${active !== null && active !== i ? ' is-dimmed' : ''}${active === i ? ' is-selected' : ''}`}
                style={{ ['--h' as string]: percent(km, max), ['--r' as string]: percent(ranKm ?? 0, max) } as CSSProperties}
                onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHover(i) }}
                onClick={() => { setHover(null); setSelected(selected === i ? null : i) }}
              >
                <span className="volume-bar" />
                {ranKm !== undefined && ranKm > 0 && <span className="volume-ran" />}
                {showValue && (
                  <span className="volume-value mono">
                    {isNow && ranKm !== undefined ? `${number(ranKm, units)} / ${number(km, units)}` : number(km, units)}
                  </span>
                )}
                {showWeek && <span className="volume-label mono">{week.number}</span>}
              </li>
            )
          })}
        </ol>

        {hovered && active !== null && (
          <div className="chart-tooltip volume-tooltip" style={{ left: `${((active + 0.5) / weeks.length) * 100}%`, bottom: percent(values[active] ?? 0, max) }}>
            Week {hovered.number} · {PHASES[hovered.phase]} · {formatDistance(values[active] ?? 0, units)}
            {hovered.isCutback ? ' · easier week' : ''}
            {ran?.has(hovered.number) ? ` · ran ${formatDistance(ran.get(hovered.number) ?? 0, units)}` : ''}
          </div>
        )}
      </div>

      <figcaption className="chart-key">
        <span>
          <span className="key-swatch" style={{ background: 'var(--accent)' }} /> Planned
        </span>
        <span>
          <span className="key-swatch key-swatch-hatched" /> Easier week
        </span>
        {ran && (
          <span>
            <span className="key-swatch key-swatch-ran" /> Ran
          </span>
        )}
        {currentWeek && (
          <span>
            <span className="key-now mono">{currentWeek}</span> This week
          </span>
        )}
        <span className="chart-note">Week numbers along the bottom. Race week leaves out the race itself.</span>
      </figcaption>

      <table className="visually-hidden">
        <caption>Weekly distance</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Phase</th>
            <th scope="col">Distance</th>
            {ran && <th scope="col">Ran</th>}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={week.number}>
              <td>{week.number}</td>
              <td>
                {PHASES[week.phase]}
                {week.isCutback ? ', easier week' : ''}
              </td>
              <td>{formatDistance(values[i] ?? 0, units)}</td>
              {ran && <td>{ran.has(week.number) ? formatDistance(ran.get(week.number) ?? 0, units) : 'Not started'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
