import { useEffect, useState } from 'react'
import { useMediaQuery } from '../../lib/use-media-query'
import { Runner } from '../shared/Runner'
import { sceneAt, SCENE_MS } from './plan-theatre'

/**
 * Taperday's original five-scene running cartoon, now shown when a plan is
 * actually being prepared. Its timing never blocks navigation or API results.
 * There are deliberately no tips, pause controls, or extra decisions.
 */
export function PlanTheatre() {
  const [tick, setTick] = useState(0)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    if (reduced) return
    const timer = window.setInterval(() => setTick((t) => t + 1), SCENE_MS)
    return () => window.clearInterval(timer)
  }, [reduced])

  const scene = sceneAt(reduced ? 4 : tick)
  return (
    <section className="plan-theatre plan-theatre-building" role="status" aria-label="Building your training plan" aria-live="off">
      <div key={reduced ? 'still' : tick} className={`wait-film wait-scene-${scene.id}`} aria-hidden="true">
        <span className="wait-caption">{scene.caption}</span>
        <span className="wait-ground" />
        {scene.id === 'rest' && <span className="wait-zzz"><i>z</i><i>z</i><i>z</i></span>}
        {scene.id === 'marks' && <span className="wait-start-line" />}
        {scene.id === 'km' && <><span className="wait-marker">5 km</span><span className="wait-marker">10 km</span><span className="wait-marker">21.1 km</span></>}
        {scene.id === 'finish' && <><span className="wait-tape wait-tape-left" /><span className="wait-tape wait-tape-right" /></>}
        <Runner pose={scene.pose} size={scene.pose === 'sleep' ? 28 : 46} className="wait-runner" />
      </div>
      <div className="plan-theatre-copy">
        <strong>Building your plan…</strong>
        <p className="field-help">Your training weeks and workouts are coming together.</p>
      </div>
    </section>
  )
}
