import { useEffect, useState } from 'react'

/** How long before the wait is explained: a warm server answers well inside this. */
export const SLOW_AFTER_MS = 6000

interface Props {
  onRetry: () => void
  onSignOut: () => void
}

/**
 * Shown on any page while Taperday checks who the runner is. The free server sleeps when nobody's using it, so the first
 * visit can take up to a minute: after a few seconds this says so, and offers a way out instead of an endless spinner.
 */
export function SignInWait({ onRetry, onSignOut }: Props) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="sign-in-wait" role="status" aria-live="polite">
      <p className="loading-line">Checking your account…</p>
      {slow && (
        <>
          <p className="field-help">
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
