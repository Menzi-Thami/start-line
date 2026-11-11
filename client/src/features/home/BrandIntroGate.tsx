import { useCallback, useState } from 'react'
import { introSeen, markIntroSeen, prefersMotion, type IntroAudience } from '../../lib/motion'
import { RaceStartIntro } from './RaceStartIntro'

/**
 * Brand film on first public entry and on the first signed-in entry in this tab.
 * Keeping these audiences separate prevents an earlier public visit from silently
 * swallowing the authenticated dashboard's introduction.
 *
 * Mount with a distinct key when the audience changes or a replay is requested.
 * No timers or state transitions run for reduced-motion visitors.
 */
export function BrandIntroGate({ audience, forceReplay = false, onFinished }: {
  audience: IntroAudience
  forceReplay?: boolean
  onFinished: () => void
}) {
  const [playing, setPlaying] = useState(() => prefersMotion() && (forceReplay || !introSeen(audience)))
  const finish = useCallback(() => {
    markIntroSeen(audience)
    setPlaying(false)
    onFinished()
  }, [audience, onFinished])

  return playing ? <RaceStartIntro onDone={finish} /> : null
}
