import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, type Auth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { ActivitySummary, PersonalBest, StravaStatus } from '../../lib/types'
import { findNewStravaArrival } from './run-arrival'

export const POLL_MS = 15_000
export const POLL_FOR_MS = 10 * 60_000
export const VISIBLE_POLL_MS = 60_000

interface Snapshot {
  owner: Auth
  runs?: ActivitySummary[]
  revision: number
  bests?: PersonalBest[]
  strava?: StravaStatus
  error: string | null
  syncError: string | null
  loading: boolean
  syncing: boolean
  newArrival: ActivitySummary | null
}
const empty = (owner: Auth): Snapshot => ({ owner, revision: 0, error: null, syncError: null, loading: true, syncing: false, newArrival: null })
const fingerprint = (status: StravaStatus) => `${status.status}|${status.syncedRuns}|${status.lastSyncedAt ?? ''}|${status.pending}|${status.failed}`

/** Account-owned recordings and import progress, shared by Home, Plan and Runs, including runners without a plan. */
export function useSyncedRuns(enabled: boolean, includeBests = true) {
  const auth = useAuth()
  const [loaded, setLoaded] = useState<Snapshot>(() => empty(auth))
  const active = useRef<Auth | null>(null)
  const reads = useRef(0)
  const checks = useRef(0)
  const previousIds = useRef<Set<string> | null>(null)
  const seen = useRef('')
  const current = loaded.owner === auth ? loaded : empty(auth)
  const update = useCallback((part: Partial<Snapshot>, recordingsChanged = false) => {
    if (active.current !== auth) return
    setLoaded(previous => {
      const owned = previous.owner === auth ? previous : empty(auth)
      return { ...owned, ...part, revision: owned.revision + (recordingsChanged ? 1 : 0), owner: auth }
    })
  }, [auth])

  const loadRuns = useCallback(async () => {
    if (active.current !== auth) return
    const mine = ++reads.current
    update({ loading: true, error: null })
    try {
      const token = await auth.getToken()
      if (active.current !== auth || mine !== reads.current) return
      if (!token) throw new Error('Sign in again to see your runs.')
      const [runs, bests] = await Promise.all([
        api.me.activities(token),
        includeBests ? api.me.bests(token).catch(() => undefined) : Promise.resolve(undefined),
      ])
      if (active.current !== auth || mine !== reads.current) return
      const arrival = findNewStravaArrival(previousIds.current, runs)
      previousIds.current = new Set(runs.map(run => run.id))
      update({ runs, ...(bests ? { bests } : {}), error: null, loading: false, ...(arrival ? { newArrival: arrival } : {}) }, true)
    } catch (error) {
      if (active.current === auth && mine === reads.current) {
        update({ error: error instanceof Error ? error.message : 'Your runs could not load. Please try again.', loading: false })
      }
    }
  }, [auth, includeBests, update])

  const checkImports = useCallback(async (catchUp: boolean) => {
    if (active.current !== auth) return
    const mine = ++checks.current
    update({ syncing: true })
    try {
      const token = await auth.getToken()
      if (active.current !== auth || mine !== checks.current) return
      if (!token) throw new Error('Sign in again to check your imports.')
      let status = await api.me.strava.status(token)
      if (active.current !== auth || mine !== checks.current) return
      if (catchUp && status.connected && status.status === 'Active') status = await api.me.strava.catchUp(token)
      if (active.current !== auth || mine !== checks.current) return
      update({ strava: status, syncError: null, syncing: false })
      return status
    } catch (error) {
      if (active.current === auth && mine === checks.current) {
        update({ syncError: error instanceof Error ? error.message : 'Your import status could not load. Please try again.', syncing: false })
      }
    }
  }, [auth, update])

  const refresh = useCallback(async () => {
    await checkImports(true)
    await loadRuns()
  }, [checkImports, loadRuns])

  useEffect(() => {
    if (!enabled) return
    active.current = auth
    previousIds.current = null
    seen.current = ''
    // Keep existing recordings usable immediately; status/catch-up must not block their first read.
    void loadRuns()
    void checkImports(true).then(status => {
      if (status?.connected && status.status === 'Active') void loadRuns()
    })
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active.current = null
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, auth, loadRuns, checkImports, refresh])

  // A failed refresh may retain available recordings, but never extend a provider copy's lifetime.
  useEffect(() => {
    const now = Date.now()
    const expiry = Math.min(...(current.runs ?? []).flatMap(run =>
      run.source.kind === 'Strava' && run.source.cachedUntil ? [Date.parse(run.source.cachedUntil)] : []).filter(value => value > now))
    if (!Number.isFinite(expiry)) return
    const timer = window.setTimeout(() => {
      setLoaded(previous => {
        if (previous.owner !== auth) return previous
        const expired = new Set((previous.runs ?? []).filter(run => run.source.kind === 'Strava'
          && run.source.cachedUntil && Date.parse(run.source.cachedUntil) <= Date.now()).map(run => run.id))
        return { ...previous, revision: previous.revision + 1, runs: previous.runs?.filter(run => !expired.has(run.id)),
          bests: previous.bests?.filter(best => !expired.has(best.activityId)),
          newArrival: previous.newArrival && expired.has(previous.newArrival.id) ? null : previous.newArrival }
      })
      void loadRuns()
    }, Math.min(expiry - now + 50, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [current.runs, auth, loadRuns])

  // Reconcile missed webhooks on foreground/periodic checks, not only on opening a training plan.
  useEffect(() => {
    if (!enabled || !current.strava?.connected || current.strava.status !== 'Active') return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, VISIBLE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, current.strava?.connected, current.strava?.status, refresh])

  const pending = current.strava?.connected === true && current.strava.status === 'Active' && current.strava.pending > 0
  useEffect(() => {
    if (!enabled || !pending) return
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - started >= POLL_FOR_MS) { window.clearInterval(timer); return }
      if (document.visibilityState !== 'visible') return
      void checkImports(false).then(status => {
        if (!status) return
        const next = fingerprint(status)
        if (next !== seen.current) { seen.current = next; void loadRuns() }
      })
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, pending, checkImports, loadRuns])

  return { ...current, reload: loadRuns, refresh, dismissArrival: () => update({ newArrival: null }) }
}
