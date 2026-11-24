import './account-warmup.css'
import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../lib/use-media-query'
import { Runner } from '../shared/Runner'
import { RunnerLoading } from '../shared/RunnerLoading'
import { SLOW_AFTER_MS, type WakeStep } from './wait-film'
import { useWakeStep } from './useWakeStep'

const STATUS: Record<WakeStep, string> = {
  server: 'Connecting to Taperday',
  database: 'Taperday’s up. Checking your account',
  almost: 'Loading your saved account',
}
const NOTE: Record<WakeStep, string> = {
  server: 'This is taking longer than usual. We’re waiting for Taperday to respond.',
  database: 'Taperday is responding. We’re checking access to your saved data.',
  almost: 'The connection checks passed. We’re still waiting for your account.',
}

interface Props {
  onRetry: () => void
  onSignOut: () => void
  /** Saved Home remains visible; only a slow connection needs this explanation. */
  quietUntilSlow?: boolean
}

/**
 * A real connection wait: the runner, what is actually being waited on, and a way out. No tips, no pause control, no
 * film length or percentage. The runner's motion stops by itself after a few seconds, so nothing moves indefinitely.
 */
export function SignInWait({ onRetry, onSignOut, quietUntilSlow = false }: Props) {
  const [slow, setSlow] = useState(false)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const step = useWakeStep(slow)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  if (quietUntilSlow && !slow) return null
  if (!slow) return <div className="sign-in-wait"><RunnerLoading label="Checking your account" compact /></div>

  return (
    <section className="sign-in-wait account-warmup" aria-label="Connecting to Taperday" data-reduced-motion={reduced}>
      <div className="account-warmup-heading">
        <div className="account-warmup-visual" aria-hidden="true"><span className="account-warmup-track" /><Runner pose="sprint" size={62} /></div>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2>{STATUS[step]}</h2>
          <p className="field-help">{NOTE[step]}</p>
        </div>
      </div>
      {quietUntilSlow && <p className="field-help">Your saved Home stays below while we reconnect.</p>}
      <div className="submit-row">
        <button type="button" className="button button-quiet" onClick={onRetry}>Try again</button>
        <button type="button" className="link-button" onClick={onSignOut}>Sign out</button>
      </div>
    </section>
  )
}
