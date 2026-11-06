import { formatDate, formatDistance, formatDuration, formatPace, type Units } from '../../lib/format'
import type { ActivitySummary, StravaStatus } from '../../lib/types'
import { syncedAgo } from './latest-run'

interface Props {
  runs: readonly ActivitySummary[]
  strava?: StravaStatus
  units: Units
  today: string
  onOpenRun: (id: string) => void
  onOpenRuns: () => void
}

/**
 * The most recent run on Home, with where it came from, the session it matched, and when Strava last synced. Only real
 * data: no run means no card unless Strava is connected, when it says it's waiting for the first one.
 */
export function LatestRun({ runs, strava, units, today, onOpenRun, onOpenRuns }: Props) {
  const latest = [...runs].filter(run => run.localDate <= today).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  const connected = !!strava?.connected
  if (!latest && !connected) return null
  const sync = connected ? (strava?.lastSyncedAt ? `Strava synced ${syncedAgo(strava.lastSyncedAt)}` : 'Strava connected') : null

  return (
    <section className="panel home-card home-latest" aria-labelledby="home-latest">
      <h2 id="home-latest" className="home-card-heading">Latest run</h2>
      {latest ? (
        <>
          <p className="field-help">
            {formatDate(latest.localDate)} · {latest.source.kind === 'Strava' ? 'Strava' : 'Upload'}
          </p>
          <p className="home-latest-figures">
            <span className="mono home-tile-value">{formatDistance(latest.distanceKm, units)}</span>
            <span className="mono field-help">
              {formatDuration(latest.movingSeconds)}
              {latest.distanceKm > 0 && latest.movingSeconds > 0 ? ` · ${formatPace(latest.movingSeconds / latest.distanceKm, units)}` : ''}
            </span>
          </p>
          <p className="field-help">{latest.plannedTitle ? `Matched: ${latest.plannedTitle}` : 'Not matched to a planned session'}</p>
          <div className="home-latest-actions">
            <button type="button" className="link-button" onClick={() => onOpenRun(latest.id)}>View run</button>
            <button type="button" className="link-button" onClick={onOpenRuns}>All runs</button>
          </div>
        </>
      ) : (
        <p>Your next Strava run will show here, and tick the matching session in your plan.</p>
      )}
      {sync && <p className="home-latest-sync field-help" role="status">{sync}</p>}
    </section>
  )
}
