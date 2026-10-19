// The strength figures are Taperday's runner in the gym: the same volt stick figure, posed by its joints. A pose
// says where the hips are, how far the body leans and where each foot and hand should be; the knees and elbows are
// worked out (two-bone inverse kinematics), so every limb keeps its length from one frame to the next and an
// animation between two poses never stretches the figure.

export type Point = readonly [number, number]

/** Which way a knee or elbow points when the limb bends. */
export type Bend = 'forward' | 'back' | 'up' | 'down'

export interface LegPose {
  /** Where the toes are. */
  toe: Point
  /** The foot's angle from pointing straight down: 90 is flat and pointing forward, less is up on the toes. */
  foot: number
  bend: Bend
}

export interface ArmPose {
  /** Where the hand is, relative to the shoulder, or resting on the hip. */
  hand: Point | 'hip'
  bend: Bend
}

export interface PoseSpec {
  hip: Point
  /** Degrees from upright: positive tips the shoulders forward (to the right), 90 is flat facing right. */
  lean: number
  /** Near leg, then far leg. */
  legs: readonly [LegPose, LegPose]
  arms: readonly [ArmPose, ArmPose]
}

export interface Figure {
  head: Point
  torso: string
  legs: [string, string]
  arms: [string, string]
  /** The near hand, for anything it holds. */
  hand: Point
}

/** Figures are drawn in a 120 × 90 box with the floor at this height. */
export const FLOOR = 85
export const VIEW = { width: 120, height: 90 } as const

const TORSO = 24
const NECK = 10
const THIGH = 17
const SHIN = 17
const FOOT = 7
const UPPER_ARM = 12
const FOREARM = 11

const DIRECTIONS: Record<Bend, Point> = { forward: [1, 0], back: [-1, 0], up: [0, -1], down: [0, 1] }
const rad = (deg: number) => (deg * Math.PI) / 180
const fmt = (n: number) => String(Math.round(n * 10) / 10)
const path = (points: Point[]) => points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join(' ')

/**
 * The middle joint of a two-bone limb from `start` reaching for `target`, bending towards `bend`. Out of reach, the
 * limb points straight at the target; either way it returns where the limb really ends.
 */
export function solveLimb(start: Point, target: Point, upper: number, lower: number, bend: Bend): { joint: Point; end: Point } {
  const dx = target[0] - start[0]
  const dy = target[1] - start[1]
  const distance = Math.hypot(dx, dy)
  const reach = (upper + lower) * 0.999
  if (distance >= reach || distance === 0) {
    const [ux, uy] = distance === 0 ? [0, 1] : [dx / distance, dy / distance]
    const end: Point = distance === 0 ? target : [start[0] + ux * Math.min(distance, upper + lower), start[1] + uy * Math.min(distance, upper + lower)]
    return { joint: [start[0] + ux * upper, start[1] + uy * upper], end }
  }
  const d = Math.max(distance, Math.abs(upper - lower) + 0.01)
  const angle = Math.acos(Math.min(1, Math.max(-1, (upper * upper + d * d - lower * lower) / (2 * upper * d))))
  const base = Math.atan2(dy, dx)
  const [bx, by] = DIRECTIONS[bend]
  const mid: Point = [(start[0] + target[0]) / 2, (start[1] + target[1]) / 2]
  const candidates = [base + angle, base - angle].map((t): Point => [start[0] + upper * Math.cos(t), start[1] + upper * Math.sin(t)])
  const score = (p: Point) => (p[0] - mid[0]) * bx + (p[1] - mid[1]) * by
  const joint = score(candidates[0]!) >= score(candidates[1]!) ? candidates[0]! : candidates[1]!
  return { joint, end: target }
}

export function figure(pose: PoseSpec): Figure {
  const [hx, hy] = pose.hip
  const along = (length: number): Point => [hx + length * Math.sin(rad(pose.lean)), hy - length * Math.cos(rad(pose.lean))]
  const shoulder = along(TORSO)

  const legs = pose.legs.map((leg) => {
    const ankle: Point = [leg.toe[0] - FOOT * Math.sin(rad(leg.foot)), leg.toe[1] - FOOT * Math.cos(rad(leg.foot))]
    const { joint, end } = solveLimb(pose.hip, ankle, THIGH, SHIN, leg.bend)
    const toe: Point = [end[0] + FOOT * Math.sin(rad(leg.foot)), end[1] + FOOT * Math.cos(rad(leg.foot))]
    return path([pose.hip, joint, end, toe])
  }) as [string, string]

  const hands: Point[] = []
  const arms = pose.arms.map((arm) => {
    const target: Point = arm.hand === 'hip' ? [hx + 4, hy - 3] : [shoulder[0] + arm.hand[0], shoulder[1] + arm.hand[1]]
    const { joint, end } = solveLimb(shoulder, target, UPPER_ARM, FOREARM, arm.bend)
    hands.push(end)
    return path([shoulder, joint, end])
  }) as [string, string]

  return { head: along(TORSO + NECK), torso: path([pose.hip, shoulder]), legs, arms, hand: hands[0]! }
}
