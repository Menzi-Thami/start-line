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
  /** How to do it, in a sentence or two. */
  howTo: string
  /** Two or three short things to keep in mind while doing it. */
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
    howTo: 'Feet hip-width apart, sit back and down until your thighs are about level with the floor, then drive up through your whole foot.',
    cues: ['Chest up', 'Knees in line with your toes', 'Weight through your heels'],
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
    howTo: 'Holding a weight against your thighs, push your hips back and slide it down your legs until your hamstrings stretch, then squeeze your glutes to stand.',
    cues: ['Flat back', 'Soft knees', 'Keep the weight close to your legs'],
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
    howTo: 'Step one foot back and lower until the back knee nearly touches the floor, then push through the front heel to stand. Every rep on one leg, then switch.',
    cues: ['Front knee over the ankle', 'Body upright', 'Control the way down'],
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
    howTo: 'With the laces of your back foot on a bench a long stride behind you, lower straight down until the front thigh is level, then drive up. One leg, then the other.',
    cues: ['Most of your weight on the front foot', 'Chest up', 'Front knee tracks over your toes'],
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
    howTo: 'Put one whole foot on a knee-high step, push through it to stand tall and bring the other knee up, then lower slowly. One leg, then the other.',
    cues: ['Whole foot on the step', 'Don’t push off the back foot', 'Slow on the way down'],
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
    howTo: 'Lie on your back with knees bent and feet flat, lift your hips until knees, hips and shoulders line up, pause, then lower slowly.',
    cues: ['Squeeze your glutes at the top', 'Ribs down: don’t arch your back', 'Push through your heels'],
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
    howTo: 'Rise onto the balls of your feet as high as you can, then lower over about three seconds. When it says each leg, stand on one foot.',
    cues: ['A hand on a wall for balance', 'All the way up', 'Slow on the way down'],
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
    howTo: 'Forearms on the floor, elbows under your shoulders, then lift your hips so you’re in a straight line from head to heels, and hold.',
    cues: ['Squeeze your glutes and brace', 'Keep breathing', 'Stop when your hips sag'],
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
    howTo: 'On your side with your elbow under your shoulder and feet stacked, lift your hips into a straight line and hold. Then switch sides.',
    cues: ['Hips high and forward', 'Top arm to the ceiling', 'Keep breathing'],
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
    howTo: 'Squat down with your arms back, then swing them forward and jump straight up. Land softly and sink straight into the next one.',
    cues: ['Land on the balls of your feet', 'Soft knees on landing', 'Stop the set when the jumps get lower'],
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
export function formatDose({ sets, reps, unit }: Pick<StrengthExercise, 'sets' | 'reps' | 'unit'>): string {
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
