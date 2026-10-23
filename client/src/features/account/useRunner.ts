import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { Runner } from '../../lib/types'

export type RunnerState =
  | { kind: 'off' }
  | { kind: 'signed-out' }
  | { kind: 'loading' }
  | { kind: 'needs-sign-up' }
  | { kind: 'ready'; runner: Runner }
  | { kind: 'error'; message: string }

/**
 * More tries of the sign-in read while the server wakes, on top of the API client's own retry. The free server sleeps
 * when idle and its database pauses too: waking both can take a couple of minutes, and the runner is watching the
 * waiting film (with a way out) the whole time, so giving up early only means signing in again.
 */
export const WAKE_RETRIES = 2

// A dropped connection or timeout (0), or the server answering before its database is back (500, 502-504).
const stillWaking = (error: unknown) => error instanceof ApiError && [0, 500, 502, 503, 504].includes(error.status)

/** Who the runner is, as far as Taperday knows: signed out, mid sign-up, or registered. */
export function useRunner() {
  const auth = useAuth()
  const [state, setState] = useState<RunnerState>(() => (auth.enabled ? { kind: 'loading' } : { kind: 'off' }))

  const fetchRunner = useCallback(() => {
    let cancelled = false
    const me = async (token: string): Promise<Runner> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await api.me.get(token)
        } catch (error) {
          if (cancelled || attempt >= WAKE_RETRIES || !stillWaking(error)) throw error
        }
      }
    }
    auth
      .getToken()
      .then((token) => (token ? me(token) : Promise.reject(new ApiError('Not signed in', 401))))
      .then((runner) => !cancelled && setState({ kind: 'ready', runner }))
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 404) setState({ kind: 'needs-sign-up' })
        else if (error instanceof ApiError && error.status === 401) setState({ kind: 'signed-out' })
        else setState({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' })
      })
    return () => {
      cancelled = true
    }
  }, [auth])

  const signedIn = auth.enabled && !auth.loading && auth.account !== null

  useEffect(() => {
    if (!signedIn) return
    return fetchRunner()
  }, [signedIn, fetchRunner])

  // Derived, not stored: the auth state alone decides these two.
  const current: RunnerState = !auth.enabled
    ? { kind: 'off' }
    : auth.loading
      ? { kind: 'loading' }
      : !auth.account
        ? { kind: 'signed-out' }
        : state

  // Retrying shows the wait again, so the runner can see something is happening.
  const refresh = () => {
    setState({ kind: 'loading' })
    fetchRunner()
  }

  return { state: current, setRunner: (runner: Runner) => setState({ kind: 'ready', runner }), refresh }
}
