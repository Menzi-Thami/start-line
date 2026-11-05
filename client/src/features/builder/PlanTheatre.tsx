import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../lib/use-media-query'
import { Runner } from '../shared/Runner'
import { SCENE_MS, sceneAt } from './plan-theatre'

/** Rendered only while the plan request is pending. No fake delay, tips or playback controls. */
export function PlanTheatre() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [tick, setTick] = useState(2)
  useEffect(() => {
    if (reduced) return
    const interval = window.setInterval(() => setTick(value => value + 1), SCENE_MS)
    return () => window.clearInterval(interval)
  }, [reduced])

  const scene = sceneAt(tick)
  return (
    <section className="plan-build-loading" role="status" aria-live="polite" aria-label="Building your training plan">
      <p className="plan-build-eyebrow">TAPERDAY · YOUR START LINE</p>
      <h2>Making your plan.</h2>
      <p className="plan-build-description">Putting your training days, race goal and recovery together.</p>
      <div className="plan-build-motion" aria-hidden="true">
        <span className="plan-build-track" />
        <Runner pose={reduced ? 'run' : scene.pose} size={62} className="plan-build-runner" />
        <span className="plan-build-finish">FINISH</span>
      </div>
      <div className="plan-build-progress" aria-hidden="true"><span /></div>
      <p className="plan-build-footnote">Your plan will open as soon as it's ready.</p>
    </section>
  )
}
