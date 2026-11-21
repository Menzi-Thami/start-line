import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { AdjustmentActions } from './PlanAdjustment'
import { useAuth, type Auth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { Units } from '../../lib/format'
import type { CheckIn, CheckInRequest, Session, SyncedCompletion } from '../../lib/types'
import { checkInKey, readCheckInCopy, subscribeCheckInCopies, visibleCheckIns, writeCheckInCopy, type CheckInCopy } from './check-in-storage'
import { queueCheckIn, resolvePendingCheckIn, syncCheckIns } from './check-in-outbox'

/** What a session needs to show and take a check-in. Only the runner's current saved plan has one. */
export interface SessionCoach {
  today: string
  units: Units
  get: (session: Session) => CheckIn | undefined
  save: (session: Session, answers: CheckInRequest) => Promise<void>
  remove: (session: Session) => Promise<void>
  adjustments?: AdjustmentActions
  entries?: readonly CheckIn[]
  saveAdditional?: (id: string, session: Session, answers: CheckInRequest) => Promise<void>
  removeAdditional?: (id: string) => Promise<void>
  /** A held Strava run that completes the session, worked out by the API on each read and never stored. */
  synced?: (session: Pick<Session, 'date' | 'type'>) => SyncedCompletion | undefined
  /** Whether this session's answer is saved on this device and still waiting to reach the account. */
  pendingFor?: (session: Pick<Session, 'date' | 'type'>) => boolean
}

const key = (date: string, type: string) => `${date}|${type}`

/** Own answers only: imported measurements never enter the offline store. Pending changes are not account saves. */
export function useCheckIns(planId: string | null) {
  const auth = useAuth()
  const owner = auth.account?.id ?? null
  const [loaded, setLoaded] = useState<{ planId: string; auth: Auth; copy: CheckInCopy; volatile?: boolean } | null>(null)
  const [failed, setFailed] = useState<{ planId: string; auth: Auth } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [syncState, setSyncState] = useState<{ auth: Auth; planId: string; busy: boolean; error: string | null; authRequired?: boolean } | null>(null)
  const mutations = useRef(new Map<string, number>())
  const context = useRef<{ auth: Auth; planId: string | null } | null>({ auth, planId })
  useEffect(() => {
    const current = context
    current.current = { auth, planId }
    return () => { current.current = null }
  }, [auth, planId])
  const active = useCallback(() => context.current?.auth === auth && context.current.planId === planId, [auth, planId])
  const subscribe = useCallback((notify: () => void) => {
    const revision = () => owner && planId ? readCheckInCopy(owner, planId)?.revision ?? null : null
    let previous = revision()
    return subscribeCheckInCopies(() => {
      const next = revision()
      if (planId && next !== previous) {
        mutations.current.set(planId, (mutations.current.get(planId) ?? 0) + 1)
        setLoaded(current => current?.volatile ? null : current)
      }
      previous = next
      notify()
    })
  }, [owner, planId])
  const snapshot = useCallback(() => owner && planId ? readCheckInCopy(owner, planId) : null, [owner, planId])
  const stored = useSyncExternalStore(subscribe, snapshot)
  const live = loaded?.auth === auth && loaded.planId === planId ? loaded : null
  const copy = live?.volatile ? live.copy : stored ?? live?.copy ?? null
  const entries = useMemo(() => copy ? visibleCheckIns(copy) : [], [copy])
  const checkIns = useMemo(() => new Map(entries.map(entry => [checkInKey(entry), entry])), [entries])

  const token = useCallback(async () => {
    const value = await auth.getToken()
    if (!value) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
    return value
  }, [auth])

  const syncNow = useCallback(async () => {
    if (!owner || !planId || !active() || !navigator.onLine) return
    setSyncState({ auth, planId, busy: true, error: null })
    try {
      await syncCheckIns(owner, planId, token, active)
      if (active()) {
        setSyncState({ auth, planId, busy: false, error: null })
        setAttempt(value => value + 1)
      }
    } catch (reason) {
      if (active()) setSyncState({ auth, planId, busy: false, error: reason instanceof Error ? reason.message : 'Your runs couldn’t sync. The device drafts are kept.', authRequired: reason instanceof ApiError && reason.status === 401 })
    }
  }, [owner, planId, auth, active, token])

  useEffect(() => {
    const connected = () => { setOffline(false); void syncNow() }
    const disconnected = () => setOffline(true)
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    if (owner && planId && readCheckInCopy(owner, planId)?.pending.length) queueMicrotask(() => void syncNow())
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected) }
  }, [owner, planId, syncNow])

  useEffect(() => {
    if (!planId) return
    let cancelled = false
    const version = mutations.current.get(planId) ?? 0
    if (!navigator.onLine) return
    token().then(value => active() ? api.me.checkIns(value, planId) : null).then(list => {
      if (!list || cancelled || !active() || version !== (mutations.current.get(planId) ?? 0)) return
      const next: CheckInCopy = { entries: list, pending: owner ? readCheckInCopy(owner, planId)?.pending ?? [] : [] }
      let volatile = false
      if (owner) {
        try { writeCheckInCopy(owner, planId, next) } catch { volatile = true }
      }
      setLoaded({ planId, auth, copy: next, volatile })
      setFailed(null)
    }).catch(() => { if (!cancelled && active()) setFailed({ planId, auth }) })
    return () => { cancelled = true }
  }, [planId, auth, owner, token, active, attempt])

  const retry = useCallback(() => { setAttempt(value => value + 1); void syncNow() }, [syncNow])

  const apply = useCallback((id: string, saved: CheckIn | null) => {
    if (!planId || !active()) return
    mutations.current.set(planId, (mutations.current.get(planId) ?? 0) + 1)
    setLoaded(current => {
      if (current?.auth !== auth || current.planId !== planId) return current
      const next = { ...current.copy, entries: [...current.copy.entries.filter(entry => checkInKey(entry) !== id), ...(saved ? [saved] : [])] }
      return { ...current, copy: next }
    })
    if (owner) {
      const stored = readCheckInCopy(owner, planId)
      if (stored) {
        const next = { ...stored, entries: [...stored.entries.filter(entry => checkInKey(entry) !== id), ...(saved ? [saved] : [])] }
        try { writeCheckInCopy(owner, planId, next) }
        catch { setLoaded({ auth, planId, copy: next, volatile: true }) }
      }
    }
  }, [auth, owner, planId, active])

  const change = useCallback(async (session: Pick<Session, 'date' | 'type'>, answers: CheckInRequest | null, additionalId?: string) => {
    if (!planId || !active()) return
    const id = additionalId ?? key(session.date, session.type)
    const queue = () => {
      if (!owner || !active()) throw new Error('Reconnect and sign in to save this run. Your form is still here.')
      queueCheckIn(owner, planId, session, answers, additionalId)
      mutations.current.set(planId, (mutations.current.get(planId) ?? 0) + 1)
    }
    // Edits to a device draft remain in its queue until the ordered sync acknowledges them.
    if (!navigator.onLine || (owner && readCheckInCopy(owner, planId)?.pending.some(item => item.key === id))) { queue(); return }
    try {
      const value = await token()
      if (!active()) return
      const saved = answers
        ? additionalId ? await api.me.saveAdditionalRun(value, planId, additionalId, session.date, session.type, answers)
          : await api.me.saveCheckIn(value, planId, session.date, session.type, answers)
        : additionalId ? await api.me.deleteAdditionalRun(value, planId, additionalId).then(() => null)
          : await api.me.deleteCheckIn(value, planId, session.date, session.type).then(() => null)
      apply(id, saved)
    } catch (reason) {
      if (!active()) return
      if (reason instanceof ApiError && reason.status === 0 && !answers?.activityId) queue()
      else throw reason
    }
  }, [owner, planId, active, token, apply])

  const save = useCallback((session: Session, answers: CheckInRequest) => change(session, answers), [change])
  const remove = useCallback((session: Session) => change(session, null), [change])
  const saveAdditional = useCallback((id: string, session: Session, answers: CheckInRequest) => change(session, answers, id), [change])
  const removeAdditional = useCallback((id: string) => {
    const entry = entries.find(item => item.id === id)
    return entry ? change({ date: entry.date, type: entry.sessionType }, null, id) : Promise.resolve()
  }, [entries, change])
  const get = useCallback((session: Session) => checkIns.get(key(session.date, session.type)), [checkIns])
  const resolvePending = useCallback((id: string, keepDevice: boolean) => {
    if (!owner || !planId || !active()) return
    resolvePendingCheckIn(owner, planId, id, keepDevice)
    void syncNow()
  }, [owner, planId, active, syncNow])
  const sync = syncState?.auth === auth && syncState.planId === planId ? syncState : null

  return {
    ready: copy !== null, failed: (failed?.auth === auth && failed.planId === planId) || (offline && !copy && !!planId), retry,
    get, save, remove, entries, saveAdditional, removeAdditional,
    offline, pending: copy?.pending ?? [], accountEntries: copy?.entries ?? [],
    syncing: sync?.busy ?? false, syncError: sync?.error ?? null, syncAuthRequired: sync?.authRequired ?? false, syncNow, resolvePending,
  }
}
