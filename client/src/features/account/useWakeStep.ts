import { useEffect, useState } from 'react'
import { isUp } from '../../lib/api-client'
import { followWake, WAKE_CHECK_MS, type WakeStep } from './wait-film'

/**
 * Waits between health checks, and for as long as the app is in the background: nobody is looking at the status, so
 * there is nothing to explain, and a phone shouldn't keep its radio busy for it. Ends at once when aborted.
 */
export function pauseWhileHidden(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    let timer: number | undefined
    const finish = () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', check)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    function check() {
      window.clearTimeout(timer)
      if (document.visibilityState === 'visible') timer = window.setTimeout(finish, ms)
    }
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', finish)
    document.addEventListener('visibilitychange', check)
    check()
  })
}

/** Dependency status, checked only when a slow load needs an explanation. */
export function useWakeStep(enabled: boolean): WakeStep {
  const [step, setStep] = useState<WakeStep>('server')

  useEffect(() => {
    if (!enabled) return
    const stop = new AbortController()
    void followWake(isUp, () => pauseWhileHidden(WAKE_CHECK_MS, stop.signal), setStep, () => stop.signal.aborted)
    return () => stop.abort()
  }, [enabled])

  return step
}
