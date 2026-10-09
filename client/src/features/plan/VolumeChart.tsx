import { useEffect, useRef, useState } from 'react'
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
const BASE_HEIGHT = 160
/** The bars never get shorter than this on screen, however narrow the column. */
const MIN_PLOT_PX = 140
/** On-screen size of every label, whatever the chart is scaled to. */
const LABEL_PX = 12
/** Room a week number needs on screen before its neighbour's can sit beside it. */
const LABEL_SLOT_PX = 22

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
  const [renderedWidth, setRenderedWidth] = useState<number | null>(null)
  const figureRef = useRef<HTMLElement>(null)
  const values = weeks.map(trainingKm)
  const max = niceMax(Math.max(...values, 1))
  const width = weeks.length * (BAR + GAP) - GAP
  // The SVG shrinks to fit its column, which on a phone would shrink the labels to a few pixels. Measure the
  // drawn width and size text in drawing units so it always lands at LABEL_PX on screen.
  useEffect(() => {
    const figure = figureRef.current
    if (!figure || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => entry && setRenderedWidth(entry.contentRect.width))
    observer.observe(figure)
    return () => observer.disconnect()
  }, [])

  const pxPerUnit = (left: number) => (renderedWidth ? renderedWidth / (width + left + 4) : 1)
  const firstGuess = LABEL_PX / pxPerUnit(36)
  const left = Math.max(36, firstGuess * 2.4 + 6)
  const px = pxPerUnit(left)
  const font = LABEL_PX / px
  const plotHeight = Math.max(BASE_HEIGHT, MIN_PLOT_PX / px)
  const scale = (km: number) => (km / max) * plotHeight
  const ticks = [0, max / 2, max]
  const axis = font + 18
  const viewWidth = width + left + 4
  const viewHeight = plotHeight + axis + 8
  const labelEvery = Math.max(weeks.length > 16 ? 4 : weeks.length > 8 ? 2 : 1, Math.ceil(LABEL_SLOT_PX / ((BAR + GAP) * px)))
  const hovered = hover === null ? undefined : weeks[hover]

  return (
    <figure className="chart" style={{ margin: 0 }} ref={figureRef}>
      <svg viewBox={`${-left} -8 ${viewWidth} ${viewHeight}`} role="img" aria-label="Weekly distance by week" onPointerLeave={() => setHover(null)}>
        <defs>
          <pattern id="cutback" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--accent-soft)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeWidth="2.5" />
          </pattern>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={-4} x2={width} y1={plotHeight - scale(t)} y2={plotHeight - scale(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={-6} y={plotHeight - scale(t) + font / 3} textAnchor="end" fontSize={font} fill="var(--muted)">
              {formatDistance(t, units).replace(` ${units}`, '')}
            </text>
          </g>
        ))}

        {weeks.map((week, i) => {
          const h = Math.max(scale(values[i] ?? 0), 2)
          const x = i * (BAR + GAP)
          const y = plotHeight - h
          const r = Math.min(4, h / 2)
          // Rounded top, square base: the bar is anchored to the axis.
          const path = `M${x},${plotHeight} V${y + r} Q${x},${y} ${x + r},${y} H${x + BAR - r} Q${x + BAR},${y} ${x + BAR},${y + r} V${plotHeight} Z`
          const isNow = currentWeek === week.number
          return (
            <g key={week.number} onPointerEnter={() => setHover(i)}>
              <rect x={x - GAP / 2} y={0} width={BAR + GAP} height={plotHeight + axis} fill="transparent" />
              <path d={path} fill={week.isCutback ? 'url(#cutback)' : 'var(--accent)'} opacity={hover === null || hover === i ? 1 : 0.55} />
              {isNow && <circle cx={x + BAR / 2} cy={plotHeight + font + 10} r={3 / px} fill="var(--ink)" />}
              {(i % labelEvery === 0 || i === weeks.length - 1) && (
                <text x={x + BAR / 2} y={plotHeight + font + 2} textAnchor="middle" fontSize={font} fill="var(--muted)">
                  {week.number}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {hovered && hover !== null && (
        <div className="chart-tooltip" style={{ left: `${((hover * (BAR + GAP) + BAR / 2 + left) / viewWidth) * 100}%`, top: `${((plotHeight - scale(values[hover] ?? 0) + 8) / viewHeight) * 100}%` }}>
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
