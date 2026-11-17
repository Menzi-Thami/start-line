import './account-warmup.css'
import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../lib/use-media-query'
import { Runner } from '../shared/Runner'
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
export const WARMUP_TIP_MS = 8_000

const TIPS = [
  'A free Strava account can bring phone and watch recordings into Taperday.',
  'Your completed training chapters and race results are kept in Journey.',
  'Recovery has its own plan. Home stays your starting point.',
  'Have a recording file? Add FIT, GPX or TCX files from Runs.',
] as const

interface Props {
  onRetry: () => void
  onSignOut: () => void
  /** Saved Home remains visible; only a slow connection needs this explanation. */
  quietUntilSlow?: boolean
}

/** A real connection wait, with automatic tips and no artificial film duration or progress percentage. */
export function SignInWait({ onRetry, onSignOut, quietUntilSlow = false }: Props) {
  const [slow, setSlow] = useState(false)
  const [paused, setPaused] = useState(false)
  const [tip, setTip] = useState(0)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const step = useWakeStep(slow)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!slow || paused) return
    let timer: number | undefined
    const resumeWhenVisible = () => {
      window.clearInterval(timer)
      if (document.visibilityState === 'visible') timer = window.setInterval(() => setTip(value => (value + 1) % TIPS.length), WARMUP_TIP_MS)
    }
    resumeWhenVisible()
    document.addEventListener('visibilitychange', resumeWhenVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', resumeWhenVisible) }
  }, [slow, paused])

  if (quietUntilSlow && !slow) return null
  if (!slow) return <div className="sign-in-wait"><p className="loading-line" role="status">Checking your account<span className="loading-dots" aria-hidden="true"><i /><i /><i /></span></p></div>

  return (
    <section className="sign-in-wait account-warmup" aria-label="Connecting to Taperday" data-paused={paused} data-reduced-motion={reduced}>
      <div className="account-warmup-heading">
        <div className="account-warmup-visual" aria-hidden="true"><span className="account-warmup-track" /><Runner pose="sprint" size={62} /></div>
        <div>
          <p className="account-warmup-kicker">A little warm-up</p>
          <div role="status" aria-live="polite" aria-atomic="true">
            <h2>{STATUS[step]}</h2>
            <p className="field-help">{NOTE[step]}</p>
          </div>
        </div>
      </div>
      {quietUntilSlow && <p className="field-help">Your saved Home stays below while we reconnect.</p>}
      <div className="account-warmup-tip">
        <div className="account-warmup-tip-label"><span>While you wait</span><span aria-hidden="true">{tip + 1}/{TIPS.length}</span></div>
        <p className="field-help" aria-live="off">{TIPS[tip]}</p>
        <div className="account-warmup-controls">
          <button type="button" className="link-button" onClick={() => setPaused(value => !value)}>{paused ? 'Resume warm-up' : 'Pause warm-up'}</button>
        </div>
      </div>
      <div className="submit-row">
        <button type="button" className="button button-quiet" onClick={onRetry}>Try again</button>
        <button type="button" className="link-button" onClick={onSignOut}>Sign out</button>
      </div>
    </section>
  )
}
