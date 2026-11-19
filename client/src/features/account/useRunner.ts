import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, type Auth } from '../../app/auth-context'
import { api, ApiError } from '../../lib/api-client'
import type { Runner } from '../../lib/types'

export type RunnerState =
  | { kind: 'off' }
  | { kind: 'signed-out' }
  | { kind: 'loading' }
  | { kind: 'needs-sign-up' }
  | { kind: 'ready'; runner: Runner }
  | { kind: 'error'; message: string; needsSignIn?: boolean }

/** A hard budget for the whole account load, including token acquisition, reads and retries. */
export const WAKE_PATIENCE_MS = 60_000
export const WAKE_TRIES = 10
export const ACCOUNT_TIMEOUT_MESSAGE = 'Your account is taking too long to load. Please try again.'

/** Short retries allow the free API to wake without repeatedly hammering it. */
export const wakePause = (attempt: number) => (import.meta.env.MODE === 'test' ? 0 : Math.min(2_000 * (attempt + 1), 10_000))
const stillWaking = (error: unknown) => error instanceof ApiError && [0, 500, 502, 503, 504].includes(error.status)

/** Account results belong to one auth context; retry and unmount cancel the previous attempt. */
export function useRunner() {
  const auth = useAuth()
  const [loaded, setLoaded] = useState<{ owner: Auth; state: RunnerState }>(() => ({
    owner: auth, state: auth.enabled ? { kind: 'loading' } : { kind: 'off' },
  }))
  const state: RunnerState = loaded.owner === auth ? loaded.state : { kind: 'loading' }
  const active = useRef<() => void>(() => {})

  const fetchRunner = useCallback(() => {
    active.current()
    const flags = { cancelled: false }
    const controller = new AbortController()
    const started = Date.now()
    const timedOut = new ApiError(ACCOUNT_TIMEOUT_MESSAGE, 0, {}, 'account_timeout')
    let rejectAbort!: () => void
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(controller.signal.reason ?? timedOut)
      controller.signal.addEventListener('abort', rejectAbort, { once: true })
    })
    const timer = window.setTimeout(() => controller.abort(timedOut), WAKE_PATIENCE_MS)
    const stop = () => { flags.cancelled = true; window.clearTimeout(timer); controller.abort() }
    active.current = stop

    const me = async (token: string): Promise<Runner> => {
      for (let attempt = 0; ; attempt++) {
        if (controller.signal.aborted) throw controller.signal.reason ?? timedOut
        try {
          return await api.me.get(token, controller.signal)
        } catch (error) {
          const pause = wakePause(attempt)
          const outOfTime = Date.now() - started + pause > WAKE_PATIENCE_MS || attempt + 1 >= WAKE_TRIES
          if (flags.cancelled || controller.signal.aborted || outOfTime || !stillWaking(error)) throw error
          await new Promise(resolve => setTimeout(resolve, pause))
        }
      }
    }
    const request = Promise.resolve().then(() => auth.getToken()).then(token => {
      if (controller.signal.aborted) throw controller.signal.reason ?? timedOut
      return token ? me(token) : Promise.reject(new ApiError('Not signed in', 401))
    })
    Promise.race([request, aborted])
      .then(runner => { if (!flags.cancelled) setLoaded({ owner: auth, state: { kind: 'ready', runner } }) })
      .catch((error: unknown) => {
        if (flags.cancelled) return
        const failed: RunnerState = error instanceof ApiError && error.status === 404 ? { kind: 'needs-sign-up' }
          : error instanceof ApiError && error.status === 401
            ? auth.account
              ? {
                  kind: 'error',
                  message: navigator.onLine
                    ? 'Your sign-in needs renewing. Continue securely to get back to your training.'
                    : 'You’re offline. Reconnect to the internet before continuing your sign-in.',
                  needsSignIn: true,
                }
              : { kind: 'signed-out' }
            : { kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }
        setLoaded({ owner: auth, state: failed })
      })
      .finally(() => { window.clearTimeout(timer); controller.signal.removeEventListener('abort', rejectAbort) })
  }, [auth])

  const signedIn = auth.enabled && !auth.loading && auth.account !== null
  useEffect(() => {
    if (!signedIn) return
    fetchRunner()
    return () => active.current()
  }, [signedIn, fetchRunner])

  const current: RunnerState = !auth.enabled ? { kind: 'off' }
    : auth.loading ? { kind: 'loading' }
      : !auth.account ? { kind: 'signed-out' } : state

  const refresh = () => {
    setLoaded({ owner: auth, state: { kind: 'loading' } })
    fetchRunner()
  }
  return {
    state: current,
    setRunner: (runner: Runner) => { active.current(); setLoaded({ owner: auth, state: { kind: 'ready', runner } }) },
    refresh,
  }
}
