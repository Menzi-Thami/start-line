import type { StravaStatus } from '../../lib/types'

/**
 * Where automatic Strava imports stand, said once. The Runs page shows `problems`: a failed check, a connection to
 * renew, runs arriving or imports that didn't finish. Add runs shows the `quiet` rest: all fine, not connected or unavailable.
 */
export function RunImportStatus({ status, error, busy, onCheck, onConnect, show }: {
  status?: StravaStatus
  error: string | null
  busy: boolean
  onCheck: () => void
  onConnect: () => void
  show: 'problems' | 'quiet'
}) {
  const arriving = !!status?.connected && status.pending > 0
  const failed = status?.connected ? status.failed : 0
  const problem = !!error || (!!status?.connected && status.status === 'NeedsReconnect') || arriving || failed > 0
  if (problem !== (show === 'problems')) return null
  if (error) return <section className="run-import-status" aria-label="Automatic run imports">
    <p className="field-error" role="status">Automatic imports could not be checked. {error}</p>
    <button type="button" className="link-button" disabled={busy} onClick={onCheck}>Try import check again</button>
  </section>
  if (status?.connected && status.status === 'NeedsReconnect') return <section className="run-import-status" aria-label="Automatic run imports">
    <p className="field-error" role="status">Reconnect Strava so new recordings can reach Taperday.</p>
    <button type="button" className="link-button" onClick={onConnect}>Reconnect Strava</button>
  </section>
  if (!status) return <p className="field-help" role="status">Checking automatic run imports…</p>
  if (!status.available && !status.connected) return <p className="field-help">Automatic Strava imports are currently unavailable. You can still upload a recording file.</p>
  if (!status.connected) return <section className="run-import-status" aria-label="Automatic run imports">
    <p className="field-help">A free Strava account can bring in recordings from your phone or watch automatically.</p>
    <button type="button" className="link-button" onClick={onConnect}>Set up automatic imports</button>
  </section>
  const lastSync = status.lastSyncedAt && Number.isFinite(Date.parse(status.lastSyncedAt))
    ? new Date(status.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null
  return <section className="run-import-status" aria-label="Automatic run imports">
    <p className="field-help" role="status">{arriving ? `Importing recordings · ${status.pending} ${status.pending === 1 ? 'check' : 'checks'} remaining.`
      : `${status.syncedRuns} synced ${status.syncedRuns === 1 ? 'recording' : 'recordings'} available.`}{lastSync && ` Last synced ${lastSync}.`}</p>
    {failed > 0 && <p className="field-error">{failed} earlier import {failed === 1 ? 'check' : 'checks'} could not finish. You can try them again in Account, under Your data.</p>}
    <button type="button" className="link-button" disabled={busy} onClick={onCheck}>{busy ? 'Checking imports…' : 'Check for runs'}</button>
  </section>
}
