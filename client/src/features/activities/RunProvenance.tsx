import { formatShortDay } from '../../lib/format'
import type { Activity } from '../../lib/types'

const FORMAT_LABEL = { Fit: 'a FIT file', Gpx: 'a GPX file', Tcx: 'a TCX file' } as const

/**
 * One quiet line saying where an uploaded run came from. Strava runs already carry their own line (with the link back
 * to Strava, as its brand rules ask), so they need nothing more here.
 */
export function RunProvenance({ run }: { run: Activity }) {
  const source = run.source
  if (source.kind !== 'Upload') return null
  return (
    <p className="activity-source run-provenance">
      Uploaded from {source.format ? FORMAT_LABEL[source.format] : 'a file'}
      {source.addedAt ? ` · ${formatShortDay(source.addedAt)}` : ''}
    </p>
  )
}
