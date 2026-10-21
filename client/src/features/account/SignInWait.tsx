import { useEffect, useState } from 'react'
import { Runner } from '../shared/Runner'

/** How long before the wait is explained: a warm server answers well inside this. */
export const SLOW_AFTER_MS = 6000

interface Props {
  onRetry: () => void
  onSignOut: () => void
}

/**
 * Shown on any page while Taperday checks who the runner is. The free server sleeps when nobody's using it, so the first
 * visit can take up to a minute. The runner sprints a lap of the track while we wait; after a few seconds, if the server
 * is still waking, it says so and offers a way out instead of an endless spinner. The scene is decoration (aria-hidden);
 * the status text carries the meaning, and the whole thing stops for reduced motion like every other animation.
 */
export function SignInWait({ onRetry, onSignOut }: Props) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="sign-in-wait" role="status" aria-live="polite">
      <div className="sign-in-track" aria-hidden="true">
        <span className="sign-in-ground" />
        <Runner pose="sprint" size={46} className="sign-in-runner" />
      </div>
      <p className="loading-line">
        Checking your account
        <span className="loading-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
      {slow && (
        <>
          <p className="field-help sign-in-wait-note">
            Waking Taperday up. Its free server sleeps when no one’s using it, so the first visit of the day can take up to a minute.
          </p>
          <div className="submit-row">
            <button type="button" className="button button-quiet" onClick={onRetry}>
              Try again
            </button>
            <button type="button" className="link-button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
