import { useEffect, useId, useState } from 'react'
import { useMediaQuery } from '../../lib/use-media-query'
import { Runner } from '../shared/Runner'
import { sceneAt, SCENE_MS, TIPS } from './plan-theatre'

/** Decoration and practical tips on the final review/build step, never an artificial loading gate. */
export function PlanTheatre() {
  const [tick, setTick] = useState(0)
  const [tip, setTip] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const tipId = useId()
  const playing = !paused && !reduced

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setTick((t) => t + 1), SCENE_MS)
    return () => window.clearInterval(timer)
  }, [playing])

  const scene = sceneAt(tick)

  return (
    <aside className={`plan-theatre${playing ? '' : ' is-paused'}`} aria-label="Running tips">
      <div key={tick} className={`wait-film wait-scene-${scene.id}`} aria-hidden="true">
        <span className="wait-caption">{scene.caption}</span>
        <span className="wait-ground" />
        {scene.id === 'rest' && <span className="wait-zzz"><i>z</i><i>z</i><i>z</i></span>}
        {scene.id === 'marks' && <span className="wait-start-line" />}
        {scene.id === 'km' && <><span className="wait-marker">5 km</span><span className="wait-marker">10 km</span><span className="wait-marker">21.1 km</span></>}
        {scene.id === 'finish' && <><span className="wait-tape wait-tape-left" /><span className="wait-tape wait-tape-right" /></>}
        <Runner pose={scene.pose} size={scene.pose === 'sleep' ? 28 : 46} className="wait-runner" />
      </div>
      <div className="plan-theatre-copy">
        <p className="wait-tip-label">A little know-how for the miles ahead</p>
        <p id={tipId} className="plan-theatre-tip" role="status" aria-live="polite" aria-atomic="true">{TIPS[tip]}</p>
        <div className="plan-theatre-controls">
          <button type="button" className="link-button" aria-controls={tipId} onClick={() => setTip((t) => (t + 1) % TIPS.length)}>Next tip</button>
          {reduced
            ? <span className="field-help">Motion reduced</span>
            : <button type="button" className="link-button" onClick={() => setPaused((p) => !p)}>{paused ? 'Play animation' : 'Pause animation'}</button>}
        </div>
      </div>
    </aside>
  )
}
