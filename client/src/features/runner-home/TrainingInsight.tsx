import type { ActivitySummary } from '../../lib/types'
import { trainingTrend, trainingWindows } from '../training-intelligence/windows'

export function TrainingInsight({ runs, today }: { runs: ActivitySummary[]; today: string }) {
  if (!runs.length) return null
  const { current, previous } = trainingWindows(runs, today)
  if (!current.runs && !previous.runs) return null
  return <details className="disclosure">
    <summary>Training insight · last 28 days</summary>
    <p><strong>{current.km.toFixed(1)} km</strong> from {current.runs} recorded {current.runs === 1 ? 'run' : 'runs'} across {current.activeDays} active {current.activeDays === 1 ? 'day' : 'days'}.</p>
    <p>{trainingTrend(current, previous)}</p>
    <p className="field-help">Compared with the preceding 28 days. This only describes the runs currently recorded in Taperday — it is not an injury, fitness or training-load prediction. Synced runs can expire and incomplete history can change totals.</p>
  </details>
}
