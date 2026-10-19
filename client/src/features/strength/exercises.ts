import type { Exercise, StrengthExercise } from '../../lib/types'
import { FLOOR, type ArmPose, type LegPose, type PoseSpec } from './pose'

/** Something to stand or rest a foot on, drawn as a block like the rest-day pillow. */
export interface Prop {
  x: number
  y: number
  width: number
  height: number
}

export interface ExerciseInfo {
  name: string
  /** How to do it, in the order you'd do it. */
  cues: string[]
  why: string
  /** Two poses the figure moves between, or one it holds (planks), breathing. */
  frames: readonly [PoseSpec] | readonly [PoseSpec, PoseSpec]
  /** Seconds for one rep, there and back. */
  seconds: number
  prop?: Prop
  /** A weight in the hands. */
  weight?: boolean
}

const flat = (x: number, bend: LegPose['bend'] = 'forward'): LegPose => ({ toe: [x, FLOOR], foot: 90, bend })
const hanging: ArmPose = { hand: [1, 22], bend: 'back' }
const onHips: ArmPose = { hand: 'hip', bend: 'back' }
const standing = (arms: readonly [ArmPose, ArmPose] = [hanging, hanging]): PoseSpec => ({
  hip: [57, 52],
  lean: 2,
  legs: [flat(64), flat(61)],
  arms,
})

const squatBottom: PoseSpec = {
  hip: [47, 69],
  lean: 38,
  legs: [flat(64), flat(61)],
  arms: [
    { hand: [20, 4], bend: 'down' },
    { hand: [20, 4], bend: 'down' },
  ],
}

export const EXERCISES: Record<Exercise, ExerciseInfo> = {
  Squat: {
    name: 'Squat',
    cues: [
      'Feet hip-width apart, toes turned out a little.',
      'Sit back and down until your thighs are about level with the floor.',
      'Keep your chest up and your knees in line with your toes.',
      'Drive up through your whole foot.',
    ],
    why: 'Builds the quads and glutes that absorb every landing.',
    frames: [
      standing([
        { hand: [20, 2], bend: 'down' },
        { hand: [20, 2], bend: 'down' },
      ]),
      squatBottom,
    ],
    seconds: 2.6,
  },
  RomanianDeadlift: {
    name: 'Romanian deadlift',
    cues: [
      'Stand tall holding a weight, or a loaded backpack, against your thighs.',
      'Soften your knees, then push your hips back and let the weight slide down your legs.',
      'Keep your back flat and stop when you feel a stretch in your hamstrings.',
      'Squeeze your glutes to stand back up.',
    ],
    why: 'Strong hamstrings and glutes power your push-off and hold up late in a race.',
    frames: [
      standing(),
      {
        hip: [49, 54],
        lean: 72,
        legs: [flat(64), flat(61)],
        arms: [
          { hand: [0, 22], bend: 'back' },
          { hand: [0, 22], bend: 'back' },
        ],
      },
    ],
    seconds: 2.8,
    weight: true,
  },
  ReverseLunge: {
    name: 'Reverse lunge',
    cues: [
      'Stand tall with your hands on your hips.',
      'Step one foot back and lower until your back knee nearly touches the floor.',
      'Keep your front knee over your ankle and your body upright.',
      'Push through your front heel to step back up. Do every rep on one leg, then switch.',
    ],
    why: 'Single-leg strength and balance, which is what running asks for.',
    frames: [
      { hip: [58, 52], lean: 2, legs: [flat(65), flat(62)], arms: [onHips, onHips] },
      {
        hip: [50, 68],
        lean: 6,
        legs: [flat(65), { toe: [34, FLOOR], foot: 60, bend: 'down' }],
        arms: [onHips, onHips],
      },
    ],
    seconds: 2.8,
  },
  BulgarianSplitSquat: {
    name: 'Bulgarian split squat',
    cues: [
      'Stand a long stride in front of a bench or step and rest the laces of your back foot on it.',
      'Lower straight down until your front thigh is about level with the floor.',
      'Keep most of your weight on your front foot and your chest up.',
      'Drive up through your front heel. Finish one leg, then switch.',
    ],
    why: 'The best single-leg builder for runners: hips, quads and balance in one move.',
    frames: [
      {
        hip: [55, 53],
        lean: 4,
        legs: [flat(72), { toe: [25, 69], foot: -100, bend: 'down' }],
        arms: [onHips, onHips],
      },
      {
        hip: [50, 67],
        lean: 10,
        legs: [flat(72), { toe: [25, 69], foot: -100, bend: 'down' }],
        arms: [onHips, onHips],
      },
    ],
    seconds: 3,
    prop: { x: 10, y: 71, width: 24, height: 16 },
  },
  StepUp: {
    name: 'Step-up',
    cues: [
      'Put one whole foot on a sturdy step or bench, about knee height.',
      'Push through that foot to stand tall on the step, bringing your other knee up.',
      'Lower yourself slowly, with control.',
      'Finish one leg, then switch.',
    ],
    why: 'Copies the drive of running uphill, one leg at a time.',
    frames: [
      {
        hip: [52, 53],
        lean: 8,
        legs: [{ toe: [76, 75], foot: 90, bend: 'forward' }, flat(50)],
        arms: [onHips, onHips],
      },
      {
        hip: [66, 43],
        lean: 4,
        legs: [{ toe: [76, 75], foot: 90, bend: 'forward' }, { toe: [74, 62], foot: 100, bend: 'forward' }],
        arms: [onHips, onHips],
      },
    ],
    seconds: 2.8,
    prop: { x: 56, y: 77, width: 30, height: 10 },
  },
  GluteBridge: {
    name: 'Glute bridge',
    cues: [
      'Lie on your back with your knees bent and your feet flat, close to your hips.',
      'Squeeze your glutes and lift your hips until you are in a straight line from knees to shoulders.',
      'Pause for a second at the top, then lower slowly.',
    ],
    why: 'Wakes up the glutes, which keep your hips level when you are tired.',
    frames: [
      {
        hip: [60, 80],
        lean: -85,
        legs: [flat(88, 'up'), flat(85, 'up')],
        arms: [
          { hand: [22, 6], bend: 'down' },
          { hand: [22, 6], bend: 'down' },
        ],
      },
      {
        hip: [62, 64],
        lean: -112,
        legs: [flat(88, 'up'), flat(85, 'up')],
        arms: [
          { hand: [20, 10], bend: 'down' },
          { hand: [20, 10], bend: 'down' },
        ],
      },
    ],
    seconds: 2.6,
  },
  CalfRaise: {
    name: 'Calf raise',
    cues: [
      'Stand tall, with a hand on a wall for balance if you need it.',
      'Rise onto the balls of your feet as high as you can.',
      'Lower slowly, taking about three seconds.',
      'When it says each leg, stand on one foot and do them one leg at a time.',
    ],
    why: 'Your calves take several times your body weight on every stride. Strong ones keep you springy to the finish.',
    frames: [
      { hip: [57, 52], lean: 0, legs: [flat(64), flat(61)], arms: [hanging, hanging] },
      {
        hip: [58, 47],
        lean: 0,
        legs: [
          { toe: [64, FLOOR], foot: 45, bend: 'forward' },
          { toe: [61, FLOOR], foot: 45, bend: 'forward' },
        ],
        arms: [hanging, hanging],
      },
    ],
    seconds: 1.8,
  },
  Plank: {
    name: 'Plank',
    cues: [
      'Forearms on the floor, elbows under your shoulders.',
      'Lift your hips so you are in a straight line from head to heels.',
      'Squeeze your glutes, brace your stomach and keep breathing.',
      'Stop when your hips start to sag.',
    ],
    why: 'A steady trunk stops you folding over when you tire.',
    frames: [
      {
        hip: [50, 73],
        lean: 82,
        legs: [
          { toe: [18.5, FLOOR], foot: 15, bend: 'up' },
          { toe: [21.5, FLOOR], foot: 15, bend: 'up' },
        ],
        arms: [
          { hand: [12, 12], bend: 'down' },
          { hand: [14, 12], bend: 'down' },
        ],
      },
    ],
    seconds: 3,
  },
  SidePlank: {
    name: 'Side plank',
    cues: [
      'Lie on your side with your elbow under your shoulder and your feet stacked.',
      'Lift your hips until your body is a straight line.',
      'Reach your top arm to the ceiling and hold.',
      'Then switch sides.',
    ],
    why: 'Strengthens the sides of your hips and trunk, which keep your pelvis level on every stride.',
    frames: [
      {
        hip: [42, 71],
        lean: 76,
        legs: [
          { toe: [16, FLOOR], foot: 60, bend: 'up' },
          { toe: [18, FLOOR], foot: 60, bend: 'up' },
        ],
        arms: [
          { hand: [11, 16], bend: 'down' },
          { hand: [2, -23], bend: 'forward' },
        ],
      },
    ],
    seconds: 3,
  },
  SquatJump: {
    name: 'Squat jump',
    cues: [
      'Squat down with your arms back.',
      'Swing your arms and jump straight up as high as you can.',
      'Land softly on the balls of your feet and sink straight into the next squat.',
      'Stop the set when the jumps start getting lower.',
    ],
    why: 'Adds spring: it trains your legs to push off quickly.',
    frames: [
      {
        ...squatBottom,
        arms: [
          { hand: [-20, 8], bend: 'down' },
          { hand: [-20, 8], bend: 'down' },
        ],
      },
      {
        hip: [57, 44],
        lean: 0,
        legs: [
          { toe: [63, 82], foot: 30, bend: 'forward' },
          { toe: [60, 82], foot: 30, bend: 'forward' },
        ],
        arms: [
          { hand: [12, -16], bend: 'forward' },
          { hand: [12, -16], bend: 'forward' },
        ],
      },
    ],
    seconds: 1.6,
  },
}

/** "3 × 10", "3 × 8 each leg", "3 × 30 s" or "2 × 30 s each side". */
export function formatDose({ sets, reps, unit }: StrengthExercise): string {
  return `${sets} × ${formatSet({ reps, unit })}`
}

/** What one set asks for: "10", "8 each leg", "30 s" or "30 s each side". */
export function formatSet({ reps, unit }: Pick<StrengthExercise, 'reps' | 'unit'>): string {
  switch (unit) {
    case 'Reps':
      return `${reps}`
    case 'RepsEachLeg':
      return `${reps} each leg`
    case 'Seconds':
      return `${reps} s`
    case 'SecondsEachSide':
      return `${reps} s each side`
  }
}
