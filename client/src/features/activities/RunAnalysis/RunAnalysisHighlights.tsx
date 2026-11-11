import { useState } from 'react'
import { Runner } from '../../shared/Runner'
import { formatDistance, formatDuration, formatPace, type Units } from '../../../lib/format'
import type { Activity, Split } from '../../../lib/types'
import { actualLine, distanceDifference, plannedLine, runVerdict } from '../activity-copy'
import './run-analysis-highlights.css'

/** Presentation-only run analysis. Never substitutes mock data for recorded activity. */
export function RunSummaryHero({ run, units }: { run: Activity; units: Units }) {
  return (
    <section className="ra-hero" aria-label="Run summary">
      <div className="ra-hero-top">
        <span className="ra-completed">✓ Run recorded</span>
        <div className="ra-hero-runner"><Runner pose="sprint" size={104} /></div>
      </div>
      <div className="ra-distance">{formatDistance(run.distanceKm, units)}</div>
      <dl className="ra-metrics">
        <div><dt>Moving time</dt><dd>{formatDuration(run.movingSeconds)}</dd></div>
        <div><dt>Average pace</dt><dd>{formatPace(run.paceSecondsPerKm, units)}</dd></div>
        {run.averageHeartRate != null && <div><dt>Avg heart rate</dt><dd>{run.averageHeartRate} <small>bpm</small></dd></div>}
      </dl>
    </section>
  )
}

export function PlanExecutionCard({ run, units, onOpenPlanDay }: {
  run: Activity
  units: Units
  onOpenPlanDay?: (date: string) => void
}) {
  if (!run.plan) return null
  const verdict = runVerdict(run, units)
  return (
    <section className="ra-card ra-plan" aria-labelledby="ra-plan-title">
      <div className="ra-heading"><span className="ra-heading-icon" aria-hidden="true">◎</span><h3 id="ra-plan-title">Plan vs actual</h3></div>
      <div className="ra-plan-grid">
        <dl>
          <div><dt>Prescribed</dt><dd>{plannedLine(run.plan, units)}</dd></div>
          <div><dt>You ran</dt><dd>{actualLine(run.plan, units)}</dd></div>
          <div><dt>Distance difference</dt><dd>{distanceDifference(run.plan, units)}</dd></div>
        </dl>
        <div className="ra-coaching">
          <strong>{verdict.headline}</strong>
          {verdict.details[0] && <p>{verdict.details[0]}</p>}
        </div>
      </div>
      {onOpenPlanDay && <button type="button" className="link-button" onClick={() => onOpenPlanDay(run.localDate)}>Open training day →</button>}
    </section>
  )
}

function validSplit(split: Split) {
  return Number.isFinite(split.paceSecondsPerKm) && split.paceSecondsPerKm > 0
    && Number.isFinite(split.distanceKm) && split.distanceKm > 0
}

/** Longer bars represent higher speed; a partial split is not ranked with full kilometres. */
export function PaceSplitsVisual({ splits, units, compact = false, onViewAll }: {
  splits: readonly Split[]
  units: Units
  compact?: boolean
  onViewAll?: () => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const valid = splits.filter(validSplit)
  const full = valid.filter(s => s.distanceKm >= 0.995)
  const fastest = full.length ? full.reduce((a, b) => a.paceSecondsPerKm <= b.paceSecondsPerKm ? a : b) : null
  const maxSpeed = Math.max(...valid.map(s => 1 / s.paceSecondsPerKm), 0)
  const visible = compact && valid.length > 5 ? valid.slice(0, 5) : valid
  if (!valid.length) return <section className="ra-card"><h3>Your pace splits</h3><p className="field-help">No recorded splits for this run.</p></section>
  return (
    <section className="ra-card ra-splits" aria-labelledby={compact ? 'ra-splits-preview-title' : 'ra-splits-full-title'}>
      <div className="ra-heading ra-splits-header">
        <h3 id={compact ? 'ra-splits-preview-title' : 'ra-splits-full-title'}>Your pace splits</h3>
        {fastest && <span className="ra-fastest">⚡ Fastest: KM {fastest.number} · {formatPace(fastest.paceSecondsPerKm, units)}</span>}
      </div>
      <div className="ra-splits-label" aria-hidden="true"><span>KM</span><span>Pace ({units === 'mi' ? '/mi' : '/km'})</span></div>
      <div className="ra-split-list">
        {visible.map(split => {
          const fastestFull = fastest === split
          const width = Math.max(18, Math.min(100, (1 / split.paceSecondsPerKm) / maxSpeed * 100))
          const partial = split.distanceKm < 0.995
          return (
            <div key={split.number} className="ra-split-item">
              <button type="button" className={'ra-split-row' + (fastestFull ? ' ra-split-best' : '')}
                onClick={() => setSelected(s => s === split.number ? null : split.number)}
                aria-expanded={selected === split.number}
                >
                <span className="ra-split-number"><span className="visually-hidden">Kilometre </span>{partial ? split.distanceKm.toFixed(2) : split.number}</span>
                <span className="ra-split-track"><span className="ra-split-fill" style={{ width: width + '%' }}><span><span className="visually-hidden"> pace </span>{formatPace(split.paceSecondsPerKm, units)}{partial && <span className="visually-hidden"> partial split</span>}</span></span></span>
              </button>
              {selected === split.number && <div className="ra-split-detail">
                {split.distanceKm.toFixed(2)} km · {formatDuration(split.movingSeconds)} moving · {split.averageHeartRate != null ? split.averageHeartRate + ' bpm' : 'Heart rate unavailable'}
              </div>}
            </div>
          )
        })}
      </div>
      {compact && valid.length > 5 && onViewAll && <button className="ra-view-all" type="button" onClick={onViewAll}>View all {valid.length} splits →</button>}
    </section>
  )
}
