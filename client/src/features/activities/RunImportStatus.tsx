import type { StravaStatus } from '../../lib/types'

export function RunImportStatus({ status, error, busy, onCheck, onConnect }: {
  status?: StravaStatus
  error: string | null
  busy: boolean
  onCheck: () => void
  onConnect: () => void
}) {
  if (error) return <section className="run-import-status" aria-label="Automatic run imports">
    <p className="field-error" role="status">Automatic imports could not be checked. {error}</p>
    <button type="button" className="link-button" disabled={busy} onClick={onCheck}>Try import check again</button>
  </section>
  if (!status) return <p className="field-help" role="status">Checking automatic run imports…</p>
  if (!status.available && !status.connected) return <p className="field-help">Automatic Strava imports are currently unavailable. You can still upload a recording file.</p>
  if (!status.connected) return <section className="run-import-status" aria-label="Automatic run imports">
    <p className="field-help">A free Strava account can bring in recordings from your phone or watch automatically.</p>
    <button type="button" className="link-button" onClick={onConnect}>Set up automatic imports</button>
  </section>
  if (status.status === 'NeedsReconnect') return <section className="run-import-status" aria-label="Automatic run imports">
    <p className="field-error" role="status">Reconnect Strava so new recordings can reach Taperday.</p>
    <button type="button" className="link-button" onClick={onConnect}>Reconnect Strava</button>
  </section>
  const lastSync = status.lastSyncedAt && Number.isFinite(Date.parse(status.lastSyncedAt))
    ? new Date(status.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null
  return <section className="run-import-status" aria-label="Automatic run imports">
    <p className="field-help" role="status">{status.pending > 0 ? `Importing recordings · ${status.pending} ${status.pending === 1 ? 'check' : 'checks'} remaining.`
      : `${status.syncedRuns} synced ${status.syncedRuns === 1 ? 'recording' : 'recordings'} available.`}{lastSync && ` Last synced ${lastSync}.`}</p>
    {status.failed > 0 && <p className="field-error">{status.failed} earlier import {status.failed === 1 ? 'check could' : 'checks could'} not finish. Check your connection and open Your run data below for recording issues.</p>}
    <button type="button" className="link-button" disabled={busy} onClick={onCheck}>{busy ? 'Checking imports…' : 'Check for runs'}</button>
  </section>
}
