import { useEffect, useState, type CSSProperties } from 'react'
import { useMediaQuery } from '../../lib/use-media-query'
import { Runner } from '../shared/Runner'
import { MOVIE_MS, SCENE_MS, sceneAt } from './plan-theatre'

/** The plan-building film: five scenes at reading pace (MOVIE_MS, about 17.5 s), chosen by the runner over a quick loader.
 * The plan opens when the film ends and the plan is ready. No tips or playback controls; reduced motion skips the wait. */
export function PlanTheatre() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (reduced) return
    const interval = window.setInterval(() => setTick(value => value + 1), SCENE_MS)
    return () => window.clearInterval(interval)
  }, [reduced])

  const scene = sceneAt(tick)
  return (
    <section className="plan-build-loading" role="status" aria-live="polite" aria-label="Building your training plan">
      <p className="plan-build-eyebrow">TAPERDAY · YOUR START LINE</p>
      <h2>{reduced ? 'Making your plan.' : scene.caption}</h2>
      <p className="plan-build-description">Putting your training days, race goal and recovery together.</p>
      <div className="plan-build-motion" aria-hidden="true">
        {reduced ? (
          <>
            <span className="plan-build-track" />
            <Runner pose="sprint" size={62} className="plan-build-runner" />
          </>
        ) : (
          // The original five scenes, each with its own set piece: asleep, on the line, off, the kilometre markers, the tape.
          <div key={tick} className={`wait-film wait-scene-${scene.id}`}>
            <span className="wait-ground" />
            {scene.id === 'rest' && <span className="wait-zzz"><i>z</i><i>z</i><i>z</i></span>}
            {scene.id === 'marks' && <span className="wait-start-line" />}
            {scene.id === 'km' && <><span className="wait-marker">5 km</span><span className="wait-marker">10 km</span><span className="wait-marker">21.1 km</span></>}
            {scene.id === 'finish' && <><span className="wait-tape wait-tape-left" /><span className="wait-tape wait-tape-right" /></>}
            <Runner pose={scene.pose} size={scene.pose === 'sleep' ? 34 : 62} className="wait-runner" />
          </div>
        )}
      </div>
      <div className={`plan-build-progress${reduced ? '' : ' is-timed'}`} aria-hidden="true" style={{ '--movie-ms': `${MOVIE_MS}ms` } as CSSProperties}><span /></div>
      <p className="plan-build-footnote">Your plan opens when the story finishes and your training is ready.</p>
    </section>
  )
}
