import { useEffect, useState } from 'react'
import { isUp } from '../../lib/api-client'
import { Runner } from '../shared/Runner'
import { followWake, SCENE_MS, sceneAt, SLOW_AFTER_MS, TIP_MS, TIPS, WAKE_CHECK_MS, type WakeStep } from './wait-film'

function useWakeStep(): WakeStep {
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

const STATUS: Record<WakeStep, string> = {
  server: 'Waking Taperday up',
  database: 'Taperday’s up. Fetching your training',
  almost: 'Almost there. Opening your page',
}

const NOTE: Record<WakeStep, string> = {
  server: 'The first visit of the day takes a minute.',
  database: 'Nearly there.',
  almost: 'Opening your page.',
}

interface Props {
  onRetry: () => void
  onSignOut: () => void
}

/**
 * Shown on any page while Taperday checks who the runner is. The free server and its database sleep when nobody's using
 * them, so the first visit of the day can take a minute or more. A short film plays while we wait, with a running tip
 * beneath it that stays long enough to read. After a few seconds, if the server is still waking, it says how far the wake
 * has got, ends with an "almost there" loader once only the account is left, and offers a way out instead of an endless
 * spinner. The film and tips are decoration (aria-hidden): the status text carries the meaning, and every animation stops
 * for reduced motion.
 */
export function SignInWait({ onRetry, onSignOut }: Props) {
  const [slow, setSlow] = useState(false)
  const [tick, setTick] = useState(0)
  const [tip, setTip] = useState(0)
  const step = useWakeStep()

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    const film = window.setInterval(() => setTick((t) => t + 1), SCENE_MS)
    const tips = window.setInterval(() => setTip((t) => t + 1), TIP_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(film)
      window.clearInterval(tips)
    }
  }, [])

  const scene = sceneAt(tick)
  const almost = slow && step === 'almost'

  return (
    <div className="sign-in-wait">
      {/* Keyed by tick, so each scene enters fresh even when two in a row share a pose. */}
      <div key={`scene-${tick}`} className={`wait-film wait-scene-${scene.id}`} aria-hidden="true">
        <span className="wait-caption">{scene.caption}</span>
        <span className="wait-ground" />
        {scene.id === 'wake' && (
          <span className="wait-zzz">
            <i>z</i>
            <i>z</i>
            <i>z</i>
          </span>
        )}
        {scene.id === 'marks' && <span className="wait-start-line" />}
        {scene.id === 'km' && (
          <>
            <span className="wait-marker">5 km</span>
            <span className="wait-marker">10 km</span>
            <span className="wait-marker">21.1 km</span>
          </>
        )}
        {scene.id === 'finish' && (
          <>
            <span className="wait-tape wait-tape-left" />
            <span className="wait-tape wait-tape-right" />
          </>
        )}
        <Runner pose={scene.pose} size={scene.pose === 'sleep' ? 28 : 46} className="wait-runner" />
      </div>
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
      {/* Keyed by tip, so each one fades in. */}
      <figure key={`tip-${tip}`} className="wait-tip" aria-hidden="true">
        <figcaption className="wait-tip-label">Running tip</figcaption>
        <p>{TIPS[tip % TIPS.length]}</p>
      </figure>
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
