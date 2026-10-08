import { useState } from 'react'
import { formatDistance, type Units } from '../../lib/format'
import type { PlanWeek } from '../../lib/types'
import { PHASES } from './copy'
import { trainingKm } from './plan-math'

interface Props {
  weeks: PlanWeek[]
  units: Units
  currentWeek: number | null
}

const BAR = 24
const GAP = 4
const HEIGHT = 160
const AXIS = 28

function niceMax(value: number): number {
  const step = value > 80 ? 20 : value > 40 ? 10 : 5
  return Math.max(step, Math.ceil(value / step) * step)
}

/**
 * One series, one hue: weekly distance. Cutback weeks are hatched rather than recoloured, so the
 * difference survives colour blindness and printing. The week list below doubles as the table view,
 * and a visually hidden table gives screen readers the same numbers.
 */
export function VolumeChart({ weeks, units, currentWeek }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const values = weeks.map(trainingKm)
  const max = niceMax(Math.max(...values, 1))
  const width = weeks.length * (BAR + GAP) - GAP
  const scale = (km: number) => (km / max) * HEIGHT
  const ticks = [0, max / 2, max]
  const labelEvery = weeks.length > 16 ? 4 : weeks.length > 8 ? 2 : 1
  const hovered = hover === null ? undefined : weeks[hover]

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <svg viewBox={`-36 -8 ${width + 40} ${HEIGHT + AXIS + 8}`} role="img" aria-label="Weekly distance by week" onPointerLeave={() => setHover(null)}>
        <defs>
          <pattern id="cutback" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--accent-soft)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeWidth="2.5" />
          </pattern>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={-4} x2={width} y1={HEIGHT - scale(t)} y2={HEIGHT - scale(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={-8} y={HEIGHT - scale(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
              {formatDistance(t, units).replace(` ${units}`, '')}
            </text>
          </g>
        ))}

        {weeks.map((week, i) => {
          const h = Math.max(scale(values[i] ?? 0), 2)
          const x = i * (BAR + GAP)
          const y = HEIGHT - h
          const r = Math.min(4, h / 2)
          // Rounded top, square base: the bar is anchored to the axis.
          const path = `M${x},${HEIGHT} V${y + r} Q${x},${y} ${x + r},${y} H${x + BAR - r} Q${x + BAR},${y} ${x + BAR},${y + r} V${HEIGHT} Z`
          const isNow = currentWeek === week.number
          return (
            <g key={week.number} onPointerEnter={() => setHover(i)}>
              <rect x={x - GAP / 2} y={0} width={BAR + GAP} height={HEIGHT + AXIS} fill="transparent" />
              <path d={path} fill={week.isCutback ? 'url(#cutback)' : 'var(--accent)'} opacity={hover === null || hover === i ? 1 : 0.55} />
              {isNow && <circle cx={x + BAR / 2} cy={HEIGHT + 22} r={3} fill="var(--ink)" />}
              {(i % labelEvery === 0 || i === weeks.length - 1) && (
                <text x={x + BAR / 2} y={HEIGHT + 14} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {week.number}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hovered && hover !== null && (
        <div className="chart-tooltip" style={{ left: `${((hover * (BAR + GAP) + BAR / 2 + 36) / (width + 40)) * 100}%`, top: `${((HEIGHT - scale(values[hover] ?? 0) + 8) / (HEIGHT + AXIS + 8)) * 100}%` }}>
          Week {hovered.number} · {PHASES[hovered.phase]} · {formatDistance(values[hover] ?? 0, units)}
          {hovered.isCutback ? ' · easier week' : ''}
        </div>
      )}

      <figcaption className="chart-key">
        <span>
          <span className="key-swatch" style={{ background: 'var(--accent)' }} /> Building
        </span>
        <span>
          <span className="key-swatch key-swatch-hatched" /> Easier week
        </span>
        {currentWeek && (
          <span>
            <span className="effort-dot" style={{ background: 'var(--ink)', width: 6, height: 6 }} /> This week
          </span>
        )}
        <span>Race week excludes the race itself.</span>
      </figcaption>

      <table className="visually-hidden">
        <caption>Weekly distance</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Phase</th>
            <th scope="col">Distance</th>
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
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
