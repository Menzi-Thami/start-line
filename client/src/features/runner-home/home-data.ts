import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { CoachNote, LoggedRun, TrainingPlan } from '../../lib/types'
import type { CurrentPlan } from '../account/useCurrentPlan'
export type HomePlan = { id: string; plan: TrainingPlan }

export function useHomePlan(
  current: CurrentPlan | null | undefined,
  initial?: HomePlan | null,
  onLoaded?: (plan: HomePlan) => void,
): { plan: TrainingPlan | null; coaching: CoachNote[]; failed: boolean; retry: () => void } {
  const auth = useAuth()
  const [plan, setPlan] = useState<HomePlan | null>(null)
  const [coaching, setCoaching] = useState<{ id: string; notes: CoachNote[] } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [failure, setFailure] = useState<{ id: string; attempt: number } | null>(null)
  const loaded = useRef(onLoaded)
  useEffect(() => {
    loaded.current = onLoaded
  }, [onLoaded])
  useEffect(() => {
    if (!current) return
    const flags = { cancelled: false }
    auth
      .getToken()
      .then((token) => (token ? api.me.coachPlan(token, current.id) : null))
      .then((saved) => {
        if (flags.cancelled) return
        if (!saved) { setFailure({ id: current.id, attempt }); return }
        const found = { id: current.id, plan: saved.plan }
        setFailure(null)
        setPlan(found)
        setCoaching({ id: current.id, notes: saved.coaching ?? [] })
        loaded.current?.(found)
      })
      .catch(() => { if (!flags.cancelled) setFailure({ id: current.id, attempt }) })
    return () => {
      flags.cancelled = true
    }
  }, [current, auth, attempt])
  // Until this visit's plan arrives, the copy from last time (if it's the same plan) stands in for it.
  const shown = plan && current && plan.id === current.id ? plan : initial
  return {
    plan: shown && current && shown.id === current.id ? shown.plan : null,
    coaching: coaching && current && coaching.id === current.id ? coaching.notes : [],
    failed: failure?.id === current?.id && failure?.attempt === attempt,
    retry: () => setAttempt((v) => v + 1),
  }
}

/**
 * Current totals: saved running history plus valid Strava measurements. Refreshed after logs, sync changes,
 * returning to the app and cache expiry; never stored in a lasting client cache.
 */
/** Every kept run since the runner started, summed once per visit for the All time tile. Null until it arrives. */
export function useAllTime(ownerId: string, enabled = true): { km: number; runs: number; since: string | null } | null {
  const auth = useAuth()
  const [total, setTotal] = useState<{ owner: string; km: number; runs: number; since: string | null } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.allTimeRunning(token) : null))
      .then((runs) => {
        if (cancelled || !runs) return
        const km = Math.round(runs.reduce((sum, r) => sum + r.distanceKm, 0) * 10) / 10
        setTotal({ owner: ownerId, km, runs: runs.length, since: runs.map((r) => r.date).sort()[0] ?? null })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [auth, ownerId, enabled])
  return total && total.owner === ownerId ? total : null
}

export function useRunningLog(version: number, activitiesVersion: string, ownerId: string, enabled = true): { log: LoggedRun[] | null; failed: boolean } {
  const auth = useAuth()
  const [loaded, setLoaded] = useState<{ ownerId: string; runs: LoggedRun[] } | null>(null)
  const log = loaded?.ownerId === ownerId ? loaded.runs : null
  const [failedVersion, setFailedVersion] = useState<{ ownerId: string; version: number } | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const visible = () => { if (document.visibilityState === 'visible') setRefresh(value => value + 1) }
    document.addEventListener('visibilitychange', visible)
    return () => document.removeEventListener('visibilitychange', visible)
  }, [enabled])
  useEffect(() => {
    const now = Date.now()
    const expiry = Math.min(...(log ?? []).flatMap(run => run.source === 'Strava' && run.cachedUntil ? [Date.parse(run.cachedUntil)] : []).filter(value => value > now))
    if (!Number.isFinite(expiry)) return
    const timer = window.setTimeout(() => { setLoaded(null); setRefresh(value => value + 1) }, Math.min(expiry - now + 50, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [log])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.running(token, true) : null))
      .then((runs) => {
        if (!cancelled) {
          if (runs) { setLoaded({ ownerId, runs }); setFailedVersion(null) }
          else setFailedVersion({ ownerId, version })
        }
      })
      .catch(() => { if (!cancelled) setFailedVersion({ ownerId, version }) })
    return () => {
      cancelled = true
    }
  }, [auth, version, activitiesVersion, refresh, ownerId, enabled])
  return { log, failed: failedVersion?.ownerId === ownerId && failedVersion.version === version }
}


/** Expiry updates the visible screen even when no navigation or provider refresh occurs. */
export function useAvailableRecordings(runs: readonly import('../../lib/types').ActivitySummary[]) {
  const [checkedAt, setCheckedAt] = useState(() => Date.now())
  const expiryKey = runs.filter(run => run.source.kind === 'Strava').map(run => `${run.id}|${run.source.cachedUntil ?? ''}`).sort().join(';')
  useEffect(() => {
    let cancelled = false
    const refresh = () => { if (!cancelled) setCheckedAt(Date.now()) }
    queueMicrotask(refresh)
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', visible) }
  }, [expiryKey])
  useEffect(() => {
    const next = Math.min(...expiryKey.split(';').map(value => Date.parse(value.slice(value.indexOf('|') + 1))).filter(value => Number.isFinite(value) && value > checkedAt))
    if (!Number.isFinite(next)) return
    const timer = window.setTimeout(() => setCheckedAt(Date.now()), Math.max(0, Math.min(next - Date.now() + 1, 2_147_483_647)))
    return () => window.clearTimeout(timer)
  }, [expiryKey, checkedAt])
  return runs.filter(run => run.source.kind !== 'Strava' || !run.source.cachedUntil || Date.parse(run.source.cachedUntil) > checkedAt)
}
