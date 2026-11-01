import type { ActivitySummary } from '../../lib/types'
import { consistencyNarrative, consistencyWeeks } from '../progress-story/consistency'

type WindowSummary = { weeks: number; distance: number; runs: number; days: number; previousDistance: number }

/** Measured history only. These windows do not predict race outcomes or assume missing runs were rest days. */
export function progressWindows(runs: readonly ActivitySummary[], today: string): WindowSummary[] {
  const day = new Date(today + 'T12:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== today) return []
  const offset = (days: number) => {
    const date = new Date(day)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }
  return [4, 8, 12].map(weeks => {
    const start = offset(-(weeks * 7 - 1))
    const before = offset(-(weeks * 14 - 1))
    const previousEnd = offset(-(weeks * 7))
    const valid = runs.filter(run => run.kind !== 'Other' && Number.isFinite(run.distanceKm) && run.distanceKm > 0 && /^\d{4}-\d{2}-\d{2}$/.test(run.localDate))
    const current = valid.filter(run => run.localDate >= start && run.localDate <= today)
    const previous = valid.filter(run => run.localDate >= before && run.localDate <= previousEnd)
    const sum = (items: typeof current) => Math.round(items.reduce((total, run) => total + run.distanceKm, 0) * 10) / 10
    return { weeks, distance: sum(current), previousDistance: sum(previous), runs: current.length, days: new Set(current.map(run => run.localDate)).size }
  })
}

export function ProgressStory({ runs, today }: { runs: ActivitySummary[]; today: string }) {
  const { current, previous } = consistencyWeeks(runs, today)
  const windows = progressWindows(runs, today)
  if (!current.runs && !previous.runs && windows.every(item => item.runs === 0)) return null
  return <details className="disclosure">
    <summary>Your running consistency</summary>
    <p><strong>{current.days} active {current.days === 1 ? 'day' : 'days'}</strong> from {current.runs} recorded runs over the last seven days.</p>
    <p>{consistencyNarrative(current, previous)}</p>
    <h3>Recorded mileage trends</h3>
    <div style={{ overflowX: 'auto' }}>
      <table>
        <caption>Rolling windows ending today. Comparison is the immediately preceding window of equal length.</caption>
        <thead><tr><th scope="col">Window</th><th scope="col">Distance</th><th scope="col">Previous</th><th scope="col">Runs</th><th scope="col">Active days</th></tr></thead>
        <tbody>{windows.map(item => <tr key={item.weeks}>
          <th scope="row">{item.weeks} weeks</th>
          <td>{item.distance.toFixed(1)} km</td><td>{item.previousDistance.toFixed(1)} km</td>
          <td>{item.runs}</td><td>{item.days}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="field-help">Values are based on available recorded runs, not a verified complete training history. Missing or expired activities can make comparisons incomplete; zero is not proof of rest. The current period can be incomplete. This is not a fitness score or race-time prediction.</p>
  </details>
}
