import { useEffect, useState } from 'react'
import { isUp } from '../../lib/api-client'
import { followWake, WAKE_CHECK_MS, type WakeStep } from './wait-film'

/** Dependency status, checked only when a slow load needs an explanation. */
export function useWakeStep(enabled: boolean): WakeStep {
  const [step, setStep] = useState<WakeStep>('server')

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    void followWake(isUp, () => new Promise((resolve) => setTimeout(resolve, WAKE_CHECK_MS)), setStep, () => stopped)
    return () => {
      stopped = true
    }
  }, [enabled])

  return step
}
