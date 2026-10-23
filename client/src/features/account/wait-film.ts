import type { RunnerPose } from '../shared/Runner'

/** How long each scene of the waiting film plays. */
export const SCENE_MS = 4000

export interface Scene {
  id: 'wake' | 'marks' | 'go' | 'km' | 'finish'
  pose: RunnerPose
  caption: string
}

/**
 * The wait as a short film, in order: the runner wakes (as the server does), takes the line, sets off, ticks off the
 * kilometres and breaks the tape. A long wait keeps running laps from the start gun.
 */
export const SCENES: readonly Scene[] = [
  { id: 'wake', pose: 'sleep', caption: 'Waking the coach' },
  { id: 'marks', pose: 'crouch', caption: 'On your marks' },
  { id: 'go', pose: 'sprint', caption: 'And they’re off' },
  { id: 'km', pose: 'sprint', caption: 'Ticking off the kilometres' },
  { id: 'finish', pose: 'victory', caption: 'Through the tape' },
]

const LOOP_FROM = 2

/** Something worth reading while the film plays: how a Taperday plan works, one rule at a time. */
export const TIPS: readonly string[] = [
  'Most of your fitness is built at an easy, chatty pace.',
  'A cutback week isn’t lost training: it’s when the work sinks in.',
  'Hard days sit apart, so your legs recover in between.',
  'Long runs are capped by time as well as distance, so they never become an all-day effort.',
  'Strides keep your legs quick without adding fatigue.',
  'Race week is light on purpose: you can’t get fitter in the last few days, only fresher.',
]

/** The scene for the nth tick of the film: once through, then laps from the start gun. */
export function sceneAt(tick: number): Scene {
  const laps = SCENES.length - LOOP_FROM
  return SCENES[tick < SCENES.length ? tick : LOOP_FROM + ((tick - LOOP_FROM) % laps)]!
}
