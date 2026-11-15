import { useState } from 'react'
import { formatDate, formatDistance } from '../../lib/format'
import type { CheckIn } from '../../lib/types'
import { checkInKey, pendingEntry, type PendingCheckIn } from './check-in-storage'

interface Props {
  ready: boolean
  failed: boolean
  retry: () => void
  offline?: boolean
  pending?: PendingCheckIn[]
  accountEntries?: CheckIn[]
  syncing?: boolean
  syncError?: string | null
  syncNow?: () => Promise<void>
  resolvePending?: (key: string, keepDevice: boolean) => void
}

const entryWords = (entry: CheckIn | null | undefined) => !entry ? 'No entry' : [entry.status,
  entry.distanceKm == null ? null : formatDistance(entry.distanceKm, 'km'), entry.duration, entry.note].filter(Boolean).join(' · ')

export function CheckInLoadState({ ready, failed, retry, offline, pending = [], accountEntries = [], syncing, syncError, syncNow, resolvePending }: Props) {
  const [review, setReview] = useState(false)
  if (pending.length > 0) return <section className="callout" aria-label="Runs waiting to sync">
    <p role="status">Saved on this device · {pending.length} run {pending.length === 1 ? 'change' : 'changes'} waiting to sync.
      {offline ? ' They will sync when you reconnect and open Taperday.' : syncing ? ' Syncing…' : ' They are not saved to your account yet.'}</p>
    {syncError && <p role="alert">{syncError}</p>}
    <div className="submit-row">
      {!offline && <button type="button" className="button button-quiet" disabled={syncing} onClick={() => void syncNow?.()}>Sync saved runs</button>}
      <button type="button" className="link-button" aria-expanded={review} onClick={() => setReview(value => !value)}>Review device drafts</button>
    </div>
    {review && <ul>{pending.map(change => <li key={change.key}>
      <p>{formatDate(change.date, 'long')} · {change.additionalId ? 'Additional run' : change.sessionType}</p>
      <p>Device draft: {change.answers ? entryWords(pendingEntry(change)) : 'Remove this entry'}</p>
      <p>Last loaded account entry: {entryWords(accountEntries.find(entry => checkInKey(entry) === change.key))}</p>
      <div className="submit-row">
        {syncError && !offline && <button type="button" className="button button-quiet" disabled={syncing} onClick={() => resolvePending?.(change.key, true)}>Keep device draft and retry</button>}
        <button type="button" className="button button-quiet" disabled={syncing} onClick={() => resolvePending?.(change.key, false)}>Discard this device draft</button>
      </div>
    </li>)}</ul>}
  </section>
  if (offline && ready) return <p className="field-help" role="status">Offline · showing your saved run entries from this device. Manual changes will wait here until you reconnect.</p>
  if (failed) return <div className="callout" role="alert">
    <p>{ready ? 'Your saved runs couldn’t refresh. Showing the entries already loaded; retry to refresh them.' : 'Your saved runs couldn’t load. Retry before logging or changing a run.'}</p>
    <button type="button" className="button button-quiet" onClick={retry}>Retry saved runs</button>
  </div>
  return ready ? null : <p role="status">Loading saved runs…</p>
}
