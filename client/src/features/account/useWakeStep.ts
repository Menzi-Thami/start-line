import { useEffect, useState } from 'react'
import { isUp } from '../../lib/api-client'
import { followWake, WAKE_CHECK_MS, type WakeStep } from './wait-film'

/** How far the free server and its database have got with waking. */
export function useWakeStep(): WakeStep {
  const [step, setStep] = useState<WakeStep>('server')

  useEffect(() => {
    let stopped = false
    void followWake(isUp, () => new Promise((resolve) => setTimeout(resolve, WAKE_CHECK_MS)), setStep, () => stopped)
    return () => {
      stopped = true
    }
  }, [])

  return step
}
