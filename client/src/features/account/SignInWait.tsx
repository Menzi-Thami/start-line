import { useEffect, useState } from 'react'
import { Runner } from '../shared/Runner'
import { SCENE_MS, sceneAt, SLOW_AFTER_MS, TIP_MS, TIPS, type WakeStep } from './wait-film'
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
}

/**
 * A compact account status for normal loads. Basic SQL stays available, though the free API can still cold-start.
 * Only a genuinely slow load starts the decorative film, tips and dependency checks; it offers retry/sign-out and
 * never imposes a minimum wait. The status carries the accessible meaning; reduced motion stops the decoration.
 */
export function SignInWait({ onRetry, onSignOut }: Props) {
  const [slow, setSlow] = useState(false)
  const [tick, setTick] = useState(0)
  const [tip, setTip] = useState(0)
  const step = useWakeStep(slow)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!slow) return
    const film = window.setInterval(() => setTick((t) => t + 1), SCENE_MS)
    const tips = window.setInterval(() => setTip((t) => t + 1), TIP_MS)
    return () => {
      window.clearInterval(film)
      window.clearInterval(tips)
    }
  }, [slow])

  const scene = sceneAt(tick)
  const almost = slow && step === 'almost'

  return (
    <div className="sign-in-wait">
      {/* Keyed by tick, so each scene enters fresh even when two in a row share a pose. */}
      {slow && (
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
      )}
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
      {slow && (
        <figure key={`tip-${tip}`} className="wait-tip" aria-hidden="true">
          <figcaption className="wait-tip-label">Running tip</figcaption>
          <p>{TIPS[tip % TIPS.length]}</p>
        </figure>
      )}
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
