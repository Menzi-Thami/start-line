import { formatDistance, formatDuration, formatPace, parseTimeSpan, type Units } from '../../lib/format'
import { RunSticker } from '../sharing/RunSticker'
import { runTypeName } from './run-types'
import type { ActivitySummary, CheckIn } from '../../lib/types'

/** Imported metrics are resolved from the live activity list, never copied to a permanent manual entry. */
export function RunResult({ entry, runs = [], units, compact = false }: { entry: CheckIn; runs?: readonly ActivitySummary[]; units: Units; compact?: boolean }) {
  if (entry.status === 'Skipped') return null
  const imported = entry.activityId ? runs.find((r) => r.id === entry.activityId) : undefined
  const ownMetrics = entry.distanceKm != null || !!entry.duration
  const km = ownMetrics ? entry.distanceKm : imported?.distanceKm
  const seconds = ownMetrics ? (entry.duration ? parseTimeSpan(entry.duration) : null) : imported?.movingSeconds
  const actual = entry.actualSessionType ?? (entry.status === 'SwappedForEasy' ? 'Easy' : null)
  const distance = km != null ? formatDistance(km, units) : entry.distanceUnreported ? 'Distance not recorded'
    : entry.prescribedKm != null ? `Actual distance not entered; ${formatDistance(entry.prescribedKm, units)} prescribed at completion` : 'Distance not entered'
  if (compact) {
    const summary = km != null ? distance : entry.distanceUnreported ? 'Distance not recorded'
      : entry.prescribedKm != null ? `${formatDistance(entry.prescribedKm, units)} prescribed` : 'Completed'
    return <span className="run-result-line mono">{summary}{seconds != null ? ` · ${formatDuration(seconds)}` : ''}</span>
  }
  return (
    <div className="run-result" aria-label={entry.isAdditional ? 'Additional run logged' : 'Completed run'}>
      <p className="wait-tip-label">{entry.isAdditional ? 'Additional run' : 'Completed'}</p>
      {actual && <p>{runTypeName(actual)}</p>}
      <p className="mono">
        {distance}
        {seconds != null ? ` · ${formatDuration(seconds)}` : ' · Time not recorded'}
      </p>
      {km != null && km > 0 && seconds != null && seconds > 0 && <p className="mono">{formatPace(seconds / km, units)}</p>}
      <p className="field-help">
        {ownMetrics ? 'Manually logged' : imported
          ? imported.source.kind === 'Strava'
            ? 'Strava · moving time'
            : 'Uploaded activity · moving time'
          : entry.activityId
            ? 'Imported activity is no longer available. Its distance and time were not copied.'
            : entry.distanceKm != null || entry.duration
              ? 'Manually logged'
              : 'Completed without details'}
      </p>
      {(km != null || seconds != null) && (
        <RunSticker
          units={units}
          run={{
            date: entry.date,
            title: actual ? runTypeName(actual) : 'Run completed',
            distanceKm: km,
            seconds,
            source: ownMetrics ? 'Manual' : imported?.source.kind ?? 'Manual',
          }}
        />
      )}
    </div>
  )
}
