import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { ActivitySummary, CheckIn, Session, SyncedCompletion } from '../../lib/types'

/** Changes whenever a check-in or a held run changes, so the completions are asked for again. */
export function completionsKey(entries: readonly CheckIn[], runs: readonly ActivitySummary[] = []): string {
  return [
    ...entries.map((c) => `${c.id ?? ''}|${c.date}|${c.sessionType}|${c.status}|${c.activityId ?? ''}|${c.updatedAt}`),
    ...runs.map((r) => `${r.id}|${r.localDate}|${r.distanceKm}|${r.source.kind}|${r.source.cachedUntil ?? ''}`),
  ].sort().join(';')
}

/**
 * Sessions a Strava run Taperday holds now completes, from the API, for the runner's saved plan. Nothing is kept on the
 * device beyond this screen: the list is fetched again when check-ins or runs change, when the app comes back to the
 * front, and the moment the earliest held run lapses, so a session never shows completed by a run that has gone.
 */
export function useSyncedCompletions(planId: string | null, refreshKey: string) {
  const auth = useAuth()
  const [loaded, setLoaded] = useState<{ planId: string; list: SyncedCompletion[] } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const list = useMemo(() => (loaded && loaded.planId === planId ? loaded.list : []), [loaded, planId])

  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') setRefresh((value) => value + 1) }
    document.addEventListener('visibilitychange', visible)
    return () => document.removeEventListener('visibilitychange', visible)
  }, [])

  useEffect(() => {
    const now = Date.now()
    const expiry = Math.min(...list.flatMap((c) => (c.cachedUntil ? [Date.parse(c.cachedUntil)] : [])).filter((value) => value > now))
    if (!Number.isFinite(expiry)) return
    const timer = window.setTimeout(() => {
      // Gone at once, before the next answer arrives: a lapsed run completes nothing.
      setLoaded((current) => current && { ...current, list: current.list.filter((c) => !c.cachedUntil || Date.parse(c.cachedUntil) > Date.now()) })
      setRefresh((value) => value + 1)
    }, Math.min(expiry - now + 50, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [list])

  useEffect(() => {
    if (!planId) return
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.stravaCompletions(token, planId) : []))
      .then((completions) => { if (!cancelled) setLoaded({ planId, list: completions }) })
      // A failed read shows no Strava completions: the runner's own ticks still stand, and nothing is claimed.
      .catch(() => { if (!cancelled) setLoaded({ planId, list: [] }) })
    return () => {
      cancelled = true
    }
  }, [planId, auth, refreshKey, refresh])

  const get = useCallback((session: Pick<Session, 'date' | 'type'>) => list.find((c) => c.date === session.date && c.sessionType === session.type), [list])
  return { get, list }
}
