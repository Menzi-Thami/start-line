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

/** Who the runner is, as far as Taperday knows: signed out, mid sign-up, or registered. */
export function useRunner() {
  const auth = useAuth()
  const [state, setState] = useState<RunnerState>(() => (auth.enabled ? { kind: 'loading' } : { kind: 'off' }))

  const fetchRunner = useCallback(() => {
    let cancelled = false
    auth
      .getToken()
      .then((token) => (token ? api.me.get(token) : Promise.reject(new ApiError('Not signed in', 401))))
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
