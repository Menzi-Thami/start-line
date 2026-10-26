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
  server: 'Waking Taperday up',
  database: 'Fetching your training',
  almost: 'Almost there',
} as const

/**
 * Just signed in, on a device with no copy of the runner's plan: the free database may still be waking, which can take a
 * minute. Rather than hold the runner on a waiting screen, the page stays usable under this one line, and their plan
 * opens by itself the moment the account answers. After a few seconds it says how far the wake has got and offers a way
 * out, as the full waiting screen does.
 */
export function FindingPlan({ name, onRetry, onSignOut }: Props) {
  const [slow, setSlow] = useState(false)
  const step = useWakeStep()

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
          {slow ? 'The first visit of the day takes up to a minute. Look around meanwhile: your plan opens here by itself.' : 'It opens here by itself.'}
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
