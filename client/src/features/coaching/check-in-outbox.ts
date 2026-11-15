import { api, ApiError } from '../../lib/api-client'
import type { CheckIn, CheckInRequest, Session } from '../../lib/types'
import { checkInKey, pendingEntry, readCheckInCopy, sameCheckIn, writeCheckInCopy, type PendingCheckIn } from './check-in-storage'

const syncing = new Map<string, Promise<void>>()

export function queueCheckIn(owner: string, planId: string, session: Pick<Session, 'date' | 'type'>,
  answers: CheckInRequest | null, additionalId?: string): void {
  if (answers?.activityId) throw new Error('Reconnect before linking an imported activity. You can save a manually entered run on this device.')
  const copy = readCheckInCopy(owner, planId)
  if (!copy) throw new Error('Load your saved runs once while connected before logging offline. Your form is still here.')
  const key = additionalId ?? `${session.date}|${session.type}`
  const previous = copy.pending.find(change => change.key === key)
  const base = previous ? previous.base : copy.entries.find(entry => checkInKey(entry) === key) ?? null
  const change: PendingCheckIn = {
    revision: Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-'),
    key, date: session.date, sessionType: session.type, additionalId, base,
    answers: answers ? { ...answers, expectedVersion: undefined, expectMissing: undefined } : null,
  }
  // Taking back a run that has never left this device simply cancels it.
  writeCheckInCopy(owner, planId, { ...copy,
    pending: [...copy.pending.filter(item => item.key !== key), ...(!answers && !base ? [] : [change])],
  })
}

export function resolvePendingCheckIn(owner: string, planId: string, key: string, keepDevice: boolean): void {
  const copy = readCheckInCopy(owner, planId)
  if (!copy) return
  writeCheckInCopy(owner, planId, { ...copy, pending: copy.pending.flatMap(change => change.key !== key ? [change]
    : keepDevice ? [{ ...change, base: copy.entries.find(entry => checkInKey(entry) === key) ?? null }] : []) })
}

function acknowledge(owner: string, planId: string, sent: PendingCheckIn, saved: CheckIn | null): void {
  const copy = readCheckInCopy(owner, planId)
  if (!copy) return
  const entries = copy.entries.filter(entry => checkInKey(entry) !== sent.key)
  if (saved) entries.push(saved)
  writeCheckInCopy(owner, planId, { entries, pending: copy.pending.flatMap(change => {
    if (change.key !== sent.key) return [change]
    // An edit made while the request was in flight is still pending, against the newly saved version.
    return change.revision === sent.revision ? [] : [{ ...change, base: saved }]
  }) })
}

/** Stable PUT/DELETE identities plus server versions make retries safe, including a lost success response. */
export function syncCheckIns(owner: string, planId: string, getToken: () => Promise<string>, active: () => boolean): Promise<void> {
  const key = `${owner}|${planId}`
  const existing = syncing.get(key)
  if (existing) return existing.then(() => active() && navigator.onLine && readCheckInCopy(owner, planId)?.pending.length
    ? syncCheckIns(owner, planId, getToken, active) : undefined)
  const work = async () => {
    if (!active() || !navigator.onLine || !readCheckInCopy(owner, planId)?.pending.length) return
    const token = await getToken()
    if (!active()) return
    const entries = await api.me.checkIns(token, planId)
    if (!active()) return
    const copy = readCheckInCopy(owner, planId)
    if (!copy) return
    writeCheckInCopy(owner, planId, { ...copy, entries })
    while (active() && navigator.onLine) {
      const next = readCheckInCopy(owner, planId)
      const change = next?.pending[0]
      if (!change) return
      const remote = next!.entries.find(entry => checkInKey(entry) === change.key) ?? null
      if (sameCheckIn(remote, pendingEntry(change))) {
        acknowledge(owner, planId, change, remote)
        continue
      }
      if (!sameCheckIn(remote, change.base) || (change.base?.version && remote?.version !== change.base.version)) {
        throw new ApiError('A run changed on another device. Review your device’s draft below before syncing it.', 409, {}, 'check_in_changed')
      }
      let saved: CheckIn | null = null
      if (change.answers) {
        const answers = { ...change.answers, expectedVersion: remote?.version ?? null, expectMissing: !remote }
        saved = change.additionalId
          ? await api.me.saveAdditionalRun(token, planId, change.additionalId, change.date, change.sessionType, answers)
          : await api.me.saveCheckIn(token, planId, change.date, change.sessionType, answers)
      } else if (change.additionalId) await api.me.deleteAdditionalRun(token, planId, change.additionalId, remote?.version)
      else await api.me.deleteCheckIn(token, planId, change.date, change.sessionType, remote?.version)
      if (!active()) return
      acknowledge(owner, planId, change, saved)
    }
  }
  // Web Locks serialize tabs as well as the in-page lock above. Older browsers still use idempotent requests and versions.
  const promise = (navigator.locks ? navigator.locks.request(`taperday-check-ins:${key}`, work) : work())
    .finally(() => { syncing.delete(key) })
  syncing.set(key, promise)
  return promise
}
