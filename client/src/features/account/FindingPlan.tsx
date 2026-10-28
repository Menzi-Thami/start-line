import { useEffect, useState } from 'react'
import { SLOW_AFTER_MS } from './wait-film'
import { useWakeStep } from './useWakeStep'

interface Props {
  /** The name the sign-in gave, before the account itself has answered. */
  name: string | null
  onRetry: () => void
  onSignOut: () => void
}

const STATUS = {
  server: 'Connecting to Taperday',
  database: 'Fetching your training',
  almost: 'Almost there',
} as const

/**
 * Just signed in, on a device with no saved copy: the page stays usable while the account answers. Slow API or network
 * responses get recovery controls and dependency checks; fast loads do not need extra readiness requests.
 */
export function FindingPlan({ name, onRetry, onSignOut }: Props) {
  const [slow, setSlow] = useState(false)
  const step = useWakeStep(slow)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="finding-plan" role="status" aria-live="polite">
      <span className="wait-spinner" aria-hidden="true" />
      <div>
        <p>
          <strong>{name ? `Signed in as ${name}.` : 'Signed in.'}</strong> {slow ? `${STATUS[step]}…` : 'Finding your plan…'}
        </p>
        <p className="field-help">
          {slow ? 'This is taking longer than usual. Look around meanwhile: your plan opens as soon as it loads.' : 'It opens here by itself.'}
        </p>
        {slow && (
          <p className="finding-plan-actions">
            <button type="button" className="link-button" onClick={onRetry}>
              Try again
            </button>
            <button type="button" className="link-button" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
