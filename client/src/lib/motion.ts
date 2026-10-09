// The site's theatre (the intro, celebrations) only plays where it's welcome: on a device that hasn't asked for
// reduced motion. Without matchMedia (old browsers, tests) the answer is no, so nothing waits on an animation.
export function prefersMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

const INTRO_KEY = 'taperday:intro-seen'

/** The intro plays once per visit (per tab). Reading has no side effects, so it's safe while rendering. */
export function introSeen(): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) !== null
  } catch {
    // Storage blocked: say it's been seen rather than risk replaying it on every screen.
    return true
  }
}

export function markIntroSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_KEY, '1')
  } catch {
    // Storage blocked: introSeen() already answers true, so nothing replays.
  }
}
