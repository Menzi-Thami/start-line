import { AuthError, InteractionRequiredAuthError } from '@azure/msal-browser'
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

/** Keep provider diagnostics out of the UI. Classify by the action the runner can take. */
export function accountLoadFailure(error: unknown, rememberedAccount: boolean): RunnerState {
  if (error instanceof ApiError && error.status === 404) return { kind: 'needs-sign-up' }
  const needsSignIn = (error instanceof ApiError && error.status === 401)
    || error instanceof InteractionRequiredAuthError
    || (error instanceof AuthError && /^(login_required|interaction_required|consent_required|no_tokens_found)$/.test(error.errorCode))
  if (needsSignIn) {
    return rememberedAccount
      ? {
          kind: 'error',
          message: navigator.onLine
            ? 'Your sign-in needs renewing. Continue securely to get back to your training.'
            : 'You’re offline. Reconnect to the internet before continuing your sign-in.',
          needsSignIn: true,
        }
      : { kind: 'signed-out' }
  }
  if (!navigator.onLine) {
    return { kind: 'error', message: 'You’re offline. Reconnect to the internet, then try loading your training again.' }
  }
  if (error instanceof ApiError && error.code === 'account_timeout') {
    return { kind: 'error', message: ACCOUNT_TIMEOUT_MESSAGE }
  }
  // MSAL's timed_out exception includes a support URL. Never show the raw exception or URL to a runner.
  if (error instanceof AuthError) {
    return { kind: 'error', message: 'The connection took longer than expected. Try again to open your training.' }
  }
  if (stillWaking(error)) {
    return { kind: 'error', message: 'Taperday is having trouble connecting right now. Your saved progress is safe. Please try again.' }
  }
  return { kind: 'error', message: 'We couldn’t load your training right now. Please try again. If this keeps happening, contact support.' }
}

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
        const failed = accountLoadFailure(error, !!auth.account)
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
