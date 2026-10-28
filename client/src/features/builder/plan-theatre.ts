import type { RunnerPose } from '../shared/Runner'

export const SCENE_MS = 4000

export interface Scene {
  id: 'rest' | 'marks' | 'go' | 'km' | 'finish'
  pose: RunnerPose
  caption: string
}

/** A little theatre while reviewing a plan; it never controls whether the finished plan can open. */
export const SCENES: readonly Scene[] = [
  { id: 'rest', pose: 'sleep', caption: 'Recovery is training' },
  { id: 'marks', pose: 'crouch', caption: 'On your marks' },
  { id: 'go', pose: 'sprint', caption: 'And they’re off' },
  { id: 'km', pose: 'sprint', caption: 'Ticking off the kilometres' },
  { id: 'finish', pose: 'victory', caption: 'Through the tape' },
]

/** Run through the story once, then keep running laps. */
export function sceneAt(tick: number): Scene {
  const loopFrom = 2
  const laps = SCENES.length - loopFrom
  return SCENES[tick < SCENES.length ? tick : loopFrom + ((tick - loopFrom) % laps)]!
}

/** General running guidance. Tips advance on request so nobody is cut off halfway through reading. */
export const TIPS: readonly string[] = [
  'Most of your fitness is built at an easy, chatty pace. If you can’t talk in full sentences, slow down.',
  'Walk breaks are a smart way to go further, not cheating. Plenty of marathoners use them.',
  'Fitness is built in the rest after a run, not during it. Sleep is part of training.',
  'Add distance gradually. Taperday never lets a week grow by more than 10%.',
  'A cutback week isn’t lost training: it’s when the work sinks in.',
  'Hard days sit apart in your plan, so your legs recover in between.',
  'Warm up with easy running before a hard session. Your first kilometres will feel better for it.',
  'Short, relaxed steps help you settle into a comfortable rhythm.',
  'Comfortable shoes matter more than the brand. Introduce new shoes on familiar, shorter runs.',
  'Strides are short, relaxed bursts of speed. They keep your legs quick without tiring you out.',
  'Long runs are capped by time as well as distance, so they never become an all-day effort.',
  'On your first race, start slower than feels right. It’s easier to speed up than to hang on.',
  'Race week is light on purpose: you can’t get fitter in the last few days, only fresher.',
  'Consistency beats heroics. A routine you can keep is more useful than one perfect week.',
  'Put your running kit out the night before. One less decision makes it easier to get out the door.',
  'Practise race-day shoes, clothing and breakfast in training so there are fewer surprises on the day.',
  'On hills or in hot weather, let effort guide you instead of chasing the same pace.',
  'Keep a little note of how each run felt. Patterns are more useful than one perfect session.',
  'Start your long run at a pace you can settle into. Finishing strong beats starting fast.',
  'Strength complements your running. Give yourself time to recover before a demanding session.',
]
