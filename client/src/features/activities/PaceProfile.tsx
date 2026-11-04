import { useId, useState } from 'react'
import { formatPace, type Units } from '../../lib/format'
import type { Split, PlannedVsActual } from '../../lib/types'

/** Read-only split evidence. A kilometre average cannot establish precise interval execution. */
export function PaceProfile({ splits, plan, units }: { splits: readonly Split[]; plan: PlannedVsActual | null; units: Units }) {
  const titleId = useId()
  const [selected, setSelected] = useState<number | null>(null)
  const points = splits.filter(split => Number.isFinite(split.paceSecondsPerKm) && split.paceSecondsPerKm > 0)
  if (points.length < 2) return <p>Not enough recorded splits to show a pace profile.</p>
  const fast = plan?.targetFastestSecondsPerKm
  const slow = plan?.targetSlowestSecondsPerKm
  const hasTarget = fast != null && slow != null && Number.isFinite(fast) && Number.isFinite(slow) && fast > 0 && slow >= fast
  const values = [...points.map(split => split.paceSecondsPerKm), ...(hasTarget ? [fast, slow] : [])]
  const low = Math.min(...values) - 10
  const high = Math.max(...values) + 10
  const x = (index: number) => 30 + index * 540 / (points.length - 1)
  const y = (pace: number) => 20 + (pace - low) * 160 / (high - low)
  const selectedIndex = Math.min(selected ?? 0, points.length - 1)
  const active = points[selectedIndex]!
  return <section className="pace-profile" aria-labelledby={titleId}>
    <h4 id={titleId}>Recorded pace by split</h4>
    <p className="field-help">Higher on this chart means faster. Select a point for its pace. Splits are recorded per kilometre, including any final partial kilometre.</p>
    <svg viewBox="0 0 600 210" role="group" aria-label="Recorded split pace profile">
      {hasTarget && <rect x="30" width="540" y={y(fast)} height={Math.max(2, y(slow) - y(fast))} fill="var(--accent)" opacity="0.18" />}
      <path d={points.map((split, index) => `${index ? 'L' : 'M'}${x(index)},${y(split.paceSecondsPerKm)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="3" />
      {points.map((split, index) => <circle key={split.number} cx={x(index)} cy={y(split.paceSecondsPerKm)} r="7" fill="var(--ink)" role="button" tabIndex={0} aria-label={`Split ${split.number}: ${formatPace(split.paceSecondsPerKm, units)}`} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)} onClick={() => setSelected(index)} onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index) }
      }} />)}
    </svg>
    <label htmlFor={`${titleId}-split`}>Inspect recorded split</label>
    <select className="input" id={`${titleId}-split`} value={selectedIndex} onChange={event => setSelected(Number(event.target.value))}>
      {points.map((split, index) => <option key={split.number} value={index}>Split {split.number} · {formatPace(split.paceSecondsPerKm, units)}</option>)}
    </select>
    <p role="status">Split {active.number} · {formatPace(active.paceSecondsPerKm, units)}</p>
    {hasTarget && <p className="field-help">Shaded band: the session's work target, {formatPace(fast, units)} to {formatPace(slow, units)}. Warm-up and recovery may have different targets. The band does not assess individual stages.</p>}
    <p className="field-help">Exact recorded values are available in the Splits tab.</p>
  </section>
}
