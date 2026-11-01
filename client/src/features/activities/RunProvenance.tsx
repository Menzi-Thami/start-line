import { formatShortDay as shortDay } from '../../lib/format'
import type { Activity } from '../../lib/types'

const FORMAT_LABEL = { Fit: 'a FIT file', Gpx: 'a GPX file', Tcx: 'a TCX file' } as const

/**
 * Where one run came from and what it's missing, behind a disclosure so the run's story stays first. Every gap gets its
 * likely reason, so an empty chart is never a mystery.
 */
export function RunProvenance({ run }: { run: Activity }) {
  const source = run.source
  const missing: string[] = []
  if (run.averageHeartRate == null) {
    missing.push(
      run.heartRate == null && source.kind === 'Upload'
        ? 'No heart rate: the file had none, or you haven’t allowed Taperday to keep heart rate (Account › Data & privacy).'
        : 'No heart rate: the recording had none.',
    )
  }
  if (run.elevationGainMetres == null) missing.push('No elevation: the watch or file didn’t record altitude.')
  if (run.splits.length === 0) missing.push('No kilometre splits: the run is shorter than a kilometre, or the file has too few points.')

  return (
    <details className="disclosure run-provenance">
      <summary>Where this run came from{missing.length > 0 ? ` · ${missing.length} ${missing.length === 1 ? 'gap' : 'gaps'}` : ''}</summary>
      <dl className="run-provenance-facts">
        {source.kind === 'Upload' ? (
          <>
            <dt>Source</dt>
            <dd>Uploaded from {source.format ? FORMAT_LABEL[source.format] : 'a file'}{source.fileName ? <> · <span className="mono">{source.fileName}</span></> : null}</dd>
            {source.addedAt && (
              <>
                <dt>Added</dt>
                <dd>{shortDay(source.addedAt)}. Kept on Taperday until you delete it.</dd>
              </>
            )}
          </>
        ) : (
          <>
            <dt>Source</dt>
            <dd>Synced from Strava{source.recordedOnGarmin ? ', recorded on Garmin' : ''}</dd>
            {source.fetchedAt && (
              <>
                <dt>Last fetched</dt>
                <dd>{shortDay(source.fetchedAt)}</dd>
              </>
            )}
            {source.cachedUntil && (
              <>
                <dt>Kept until</dt>
                <dd>{shortDay(source.cachedUntil)}, then fetched again or removed. Strava’s rules let apps hold a run for 7 days; upload the file to keep it for good.</dd>
              </>
            )}
          </>
        )}
      </dl>
      {missing.length > 0 ? (
        <ul className="run-provenance-gaps">
          {missing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="field-help">Nothing missing: distance, time, heart rate, elevation and splits are all here.</p>
      )}
    </details>
  )
}
