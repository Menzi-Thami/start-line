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

const testing = import.meta.env.MODE === 'test'

/** How long before the wait is explained: a warm server answers well inside this. */
export const SLOW_AFTER_MS = testing ? 300 : 6000

/** Between checks of whether the server is up yet. */
export const WAKE_CHECK_MS = testing ? 20 : 3000

/** How far a slow request has got: API reachable, database ready, then account still loading. */
export type WakeStep = 'server' | 'database' | 'almost'

/**
 * Follows the wake through the API's health checks: `live` answers once the server is up (it never touches the
 * database), then `ready` once the database is healthy. Only ever a hint
 * for the screen: a failed check is "not yet", and the page shows the moment the account loads, whatever this says.
 */
export async function followWake(
  up: (check: 'live' | 'ready') => Promise<boolean>,
  pause: () => Promise<unknown>,
  onStep: (step: WakeStep) => void,
  stopped: () => boolean,
): Promise<void> {
  while (!stopped() && !(await up('live'))) await pause()
  if (stopped()) return
  onStep('database')
  while (!stopped() && !(await up('ready'))) await pause()
  if (!stopped()) onStep('almost')
}

/** How long each tip stays up: long enough to read it twice, so nobody's cut off mid-sentence. */
export const TIP_MS = 8000

/**
 * Something worth reading while the film plays, written for someone new to running as much as for a regular: what
 * makes training work, and how a Taperday plan uses it. General, well-established advice only; nothing medical.
 */
export const TIPS: readonly string[] = [
  'Most of your fitness is built at an easy, chatty pace. If you can’t talk in full sentences, slow down.',
  'Walk breaks are a smart way to go further, not cheating. Plenty of marathoners use them.',
  'Fitness is built in the rest after a run, not during it. Sleep is part of training.',
  'Add distance gradually. Taperday never lets a week grow by more than 10%.',
  'A cutback week isn’t lost training: it’s when the work sinks in.',
  'Hard days sit apart in your plan, so your legs recover in between.',
  'Warm up with ten minutes of easy running before a hard session. Your first kilometres will feel better for it.',
  'Short, quick steps are usually kinder to your legs than long, reaching strides.',
  'Comfortable shoes matter more than the brand. Most last somewhere between 500 and 800 km.',
  'Strides are short, relaxed bursts of speed. They keep your legs quick without tiring you out.',
  'Long runs are capped by time as well as distance, so they never become an all-day effort.',
  'On your first race, start slower than feels right. It’s far easier to speed up than to hang on.',
  'Race week is light on purpose: you can’t get fitter in the last few days, only fresher.',
  'Consistency beats heroics. Three easy runs a week, every week, builds more than one big run now and then.',
]

/** The scene for the nth tick of the film: once through, then laps from the start gun. */
export function sceneAt(tick: number): Scene {
  const laps = SCENES.length - LOOP_FROM
  return SCENES[tick < SCENES.length ? tick : LOOP_FROM + ((tick - LOOP_FROM) % laps)]!
}
