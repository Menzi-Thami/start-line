import { useEffect, useState } from 'react'
import { SLOW_AFTER_MS, type WakeStep } from './wait-film'
import { useWakeStep } from './useWakeStep'

const STATUS: Record<WakeStep, string> = {
  server: 'Connecting to Taperday',
  database: 'Taperday’s up. Fetching your training',
  almost: 'Almost there. Opening your page',
}

const NOTE: Record<WakeStep, string> = {
  server: 'This is taking longer than usual. Your page opens as soon as it’s ready.',
  database: 'Nearly there.',
  almost: 'Opening your page.',
}

interface Props {
  onRetry: () => void
  onSignOut: () => void
  /** Cached Home stays quiet during fast loads, but slow loads must still offer recovery. */
  quietUntilSlow?: boolean
}

/**
 * A compact account status for normal loads. Basic SQL stays available, though the free API can still cold-start.
 * A slow load starts dependency checks and offers retry/sign-out; it never imposes a minimum wait.
 * The runner's decorative film and training tips now belong to plan creation.
 */
export function SignInWait({ onRetry, onSignOut, quietUntilSlow = false }: Props) {
  const [slow, setSlow] = useState(false)
  const step = useWakeStep(slow)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const almost = slow && step === 'almost'

  // A cached Home already shows the runner's last-known greeting: avoid a flash of
  // duplicate loading copy on fast starts, but never strand them on a slow start.
  if (quietUntilSlow && !slow) return null

  return (
    <div className="sign-in-wait">
      <div role="status" aria-live="polite">
        <p className={`loading-line${almost ? ' is-almost' : ''}`}>
          {almost && <span className="wait-spinner" aria-hidden="true" />}
          {slow ? STATUS[step] : 'Checking your account'}
          {!almost && (
            <span className="loading-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </p>
        {slow && <p className="field-help sign-in-wait-note">{NOTE[step]}</p>}
      </div>
      {slow && (
        <div className="submit-row">
          <button type="button" className="button button-quiet" onClick={onRetry}>
            Try again
          </button>
          <button type="button" className="link-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
