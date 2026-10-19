import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { ActivitySummary, PersonalBest, StravaStatus } from '../../lib/types'

/** While Strava has runs in flight, look again this often. */
export const POLL_MS = 15_000

/** Stop looking after this long even if something is stuck; opening the plan again starts over. */
export const POLL_FOR_MS = 10 * 60_000

/**
 * The runner's runs, personal bests and Strava status for the plan view. Opening the plan asks Strava for anything
 * missed (at most every 10 minutes, server side), then polls only while runs are being fetched, and reloads when the
 * tab comes back into view. Failures leave the plan showing without runs rather than breaking it.
 */
export function useSyncedRuns(enabled: boolean) {
  const auth = useAuth()
  const [runs, setRuns] = useState<ActivitySummary[] | undefined>(undefined)
  const [bests, setBests] = useState<PersonalBest[] | undefined>(undefined)
  const [strava, setStrava] = useState<StravaStatus | undefined>(undefined)
  const seen = useRef<string>('')

  const loadRuns = useCallback(async () => {
    const token = await auth.getToken()
    if (!token) return
    const [list, pbs] = await Promise.all([api.me.activities(token), api.me.bests(token).catch(() => undefined)])
    setRuns(list)
    if (pbs) setBests(pbs)
  }, [auth])

  // On open: runs first (the plan shouldn't wait for Strava), then a catch-up if connected.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const open = async () => {
      await loadRuns().catch(() => undefined)
      const token = await auth.getToken()
      if (!token || cancelled) return
      let status = await api.me.strava.status(token)
      if (status.connected && status.status === 'Active') status = await api.me.strava.catchUp(token)
      if (!cancelled) setStrava(status)
    }
    open().catch(() => undefined)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadRuns().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, auth, loadRuns])

  // While runs are on their way, poll the status and reload the runs whenever more have arrived.
  const pending = strava?.connected === true && strava.pending > 0
  useEffect(() => {
    if (!enabled || !pending) return
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) {
        window.clearInterval(timer)
        return
      }
      auth
        .getToken()
        .then((token) => (token ? api.me.strava.status(token) : undefined))
        .then(async (status) => {
          if (!status) return
          const fingerprint = `${status.syncedRuns}|${status.lastSyncedAt ?? ''}|${status.pending}`
          if (fingerprint !== seen.current) {
            seen.current = fingerprint
            await loadRuns()
          }
          setStrava(status)
        })
        .catch(() => undefined)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled, pending, auth, loadRuns])

  return { runs, bests, strava, reload: loadRuns }
}
