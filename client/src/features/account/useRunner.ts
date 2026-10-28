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
 * How long the sign-in read keeps trying while the server wakes, on top of the API client's own retry. It's a ceiling,
 * not a wait: the page shows the moment the account loads. Basic SQL no longer pauses for a free compute allowance,
 * but the free API host can cold-start or restart during deployment. Slow loads get recovery controls; fast loads
 * never wait for this ceiling. Time and attempt limits keep a quickly failing server from being retried indefinitely.
 */
export const WAKE_PATIENCE_MS = 150_000

/** A ceiling on tries as well, so a server that keeps erroring quickly is never asked hundreds of times. */
export const WAKE_TRIES = 30

/** The pause before the nth retry: two seconds, growing to ten. */
export const wakePause = (attempt: number) => (import.meta.env.MODE === 'test' ? 0 : Math.min(2_000 * (attempt + 1), 10_000))

// A dropped connection or timeout (0), or the server answering before its database is back (500, 502-504).
const stillWaking = (error: unknown) => error instanceof ApiError && [0, 500, 502, 503, 504].includes(error.status)

/** Who the runner is, as far as Taperday knows: signed out, mid sign-up, or registered. */
export function useRunner() {
  const auth = useAuth()
  const [state, setState] = useState<RunnerState>(() => (auth.enabled ? { kind: 'loading' } : { kind: 'off' }))

  const fetchRunner = useCallback(() => {
    let cancelled = false
    const me = async (token: string): Promise<Runner> => {
      const started = Date.now()
      for (let attempt = 0; ; attempt++) {
        try {
          return await api.me.get(token)
        } catch (error) {
          const pause = wakePause(attempt)
          const outOfTime = Date.now() - started + pause > WAKE_PATIENCE_MS || attempt + 1 >= WAKE_TRIES
          if (cancelled || outOfTime || !stillWaking(error)) throw error
          await new Promise((resolve) => setTimeout(resolve, pause))
          if (cancelled) throw error
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
