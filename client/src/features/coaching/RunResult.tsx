import { formatDistance, formatDuration, parseTimeSpan, type Units } from '../../lib/format'
import { RunSticker } from '../sharing/RunSticker'
import { runTypeName } from './run-types'
import type { ActivitySummary, CheckIn } from '../../lib/types'

/** Imported metrics are resolved from the live activity list, never copied to a permanent manual entry. */
export function RunResult({ entry, runs = [], units }: { entry: CheckIn; runs?: readonly ActivitySummary[]; units: Units }) {
  if (entry.status === 'Skipped') return null
  const imported = entry.activityId ? runs.find((r) => r.id === entry.activityId) : undefined
  const km = imported?.distanceKm ?? entry.distanceKm
  const seconds = imported?.movingSeconds ?? (entry.duration ? parseTimeSpan(entry.duration) : null)
  const actual = entry.actualSessionType ?? (entry.status === 'SwappedForEasy' ? 'Easy' : null)
  return (
    <div className="run-result" aria-label={entry.isAdditional ? 'Additional run logged' : 'Completed run'}>
      <p className="wait-tip-label">{entry.isAdditional ? 'Additional run' : 'Completed'}</p>
      {actual && <p>{runTypeName(actual)}</p>}
      <p className="mono">
        {km != null
          ? formatDistance(km, units)
          : entry.distanceUnreported
            ? 'Distance not recorded'
            : 'Distance not entered; planned distance used'}
        {seconds != null ? ` · ${formatDuration(seconds)}` : ' · Time not recorded'}
      </p>
      <p className="field-help">
        {imported
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
            source: imported?.source.kind ?? 'Manual',
          }}
        />
      )}
    </div>
  )
}
