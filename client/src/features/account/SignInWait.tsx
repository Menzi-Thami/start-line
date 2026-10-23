import { useEffect, useState } from 'react'
import { Runner } from '../shared/Runner'
import { SCENE_MS, sceneAt, TIPS } from './wait-film'

/** How long before the wait is explained: a warm server answers well inside this. */
export const SLOW_AFTER_MS = 6000

interface Props {
  onRetry: () => void
  onSignOut: () => void
}

/**
 * Shown on any page while Taperday checks who the runner is. The free server and its database sleep when nobody's using
 * them, so the first visit of the day can take a minute or more. A short film plays while we wait, with a tip beneath it;
 * after a few seconds, if the server is still waking, it says so and offers a way out instead of an endless spinner. The
 * film is decoration (aria-hidden) and the tips aren't announced: the status text carries the meaning, and every
 * animation stops for reduced motion.
 */
export function SignInWait({ onRetry, onSignOut }: Props) {
  const [slow, setSlow] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    const film = window.setInterval(() => setTick((t) => t + 1), SCENE_MS)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(film)
    }
  }, [])

  const scene = sceneAt(tick)

  return (
    <div className="sign-in-wait">
      {/* Keyed by tick, so each scene enters fresh even when two in a row share a pose. */}
      <div key={tick} className={`wait-film wait-scene-${scene.id}`} aria-hidden="true">
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
        <p className="loading-line">
          Checking your account
          <span className="loading-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
        {slow && (
          <p className="field-help sign-in-wait-note">
            Waking Taperday up. Its free server sleeps when no one’s using it, so the first visit of the day can take a minute or
            two.
          </p>
        )}
      </div>
      <p className="wait-tip">{TIPS[tick % TIPS.length]}</p>
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
