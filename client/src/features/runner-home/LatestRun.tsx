import { formatDate, formatDistance, formatDuration, type Units } from '../../lib/format'
import { useAvailableRecordings } from './home-data'
import type { ActivitySummary, StravaStatus } from '../../lib/types'
interface Props { runs: readonly ActivitySummary[]; strava?: StravaStatus; units: Units; today: string; onOpenRun: (id: string) => void; onOpenRuns: () => void }
/** A quiet, source-labelled recent recording. Empty sync diagnostics belong in Runs. */
export function LatestRun({ runs, units, today, onOpenRun, onOpenRuns }: Props) {
  const available = useAvailableRecordings(runs)
  const latest = [...available].filter(run => run.localDate <= today)
    .sort((a, b) => (b.startedAt ?? b.localDate).localeCompare(a.startedAt ?? a.localDate))[0]
  if (!latest) return null
  return <section className="home-latest home-recent-recording" aria-labelledby="home-latest">
    <div><h2 id="home-latest" className="home-card-heading">Recent activity</h2><p className="field-help">{formatDate(latest.localDate)} · {latest.source.kind === 'Strava' ? 'Strava' : 'Upload'}</p>
      <p className="mono">{formatDistance(latest.distanceKm, units)}{Number.isFinite(latest.movingSeconds) ? ` · ${formatDuration(latest.movingSeconds)} moving` : ''}</p></div>
    <div className="home-latest-actions"><button type="button" className="link-button" onClick={() => onOpenRun(latest.id)}>View run</button><button type="button" className="link-button" onClick={onOpenRuns}>All runs</button></div>
  </section>
}
