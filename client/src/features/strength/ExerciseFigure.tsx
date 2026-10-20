import { prefersMotion } from '../../lib/motion'
import type { Exercise } from '../../lib/types'
import { EXERCISES } from './exercises'
import { figure, FLOOR, VIEW, type Figure } from './pose'

interface Props {
  exercise: Exercise
  /** Height in pixels; the width follows. */
  size?: number
}

const EASE = '0.45 0 0.55 1'

/**
 * One rep, there and back, by moving each line between two poses. SVG's own animation is used because CSS can't
 * animate a path's shape in every browser; it's only rendered when motion is welcome, so the global reduced-motion
 * rule isn't needed to stop it.
 */
function Tween({ attribute, values, seconds }: { attribute: string; values: string[]; seconds: number }) {
  return (
    <animate
      attributeName={attribute}
      values={[...values, values[0]].join(';')}
      dur={`${seconds}s`}
      repeatCount="indefinite"
      calcMode="spline"
      keyTimes="0;0.5;1"
      keySplines={`${EASE};${EASE}`}
    />
  )
}

function Body({ frames, seconds, weight }: { frames: Figure[]; seconds: number; weight: boolean }) {
  const [first] = frames
  const moving = frames.length > 1
  const line = (pick: (f: Figure) => string) =>
    moving ? (
      <path d={pick(first!)}>
        <Tween attribute="d" values={frames.map(pick)} seconds={seconds} />
      </path>
    ) : (
      <path d={pick(first!)} />
    )
  const dot = (pick: (f: Figure) => readonly [number, number], r: number) => (
    <circle cx={pick(first!)[0]} cy={pick(first!)[1]} r={r} fill="currentColor" stroke="none">
      {moving && <Tween attribute="cx" values={frames.map((f) => String(pick(f)[0]))} seconds={seconds} />}
      {moving && <Tween attribute="cy" values={frames.map((f) => String(pick(f)[1]))} seconds={seconds} />}
    </circle>
  )

  return (
    <>
      {line((f) => f.legs[1])}
      {line((f) => f.arms[1])}
      {line((f) => f.torso)}
      {dot((f) => f.head, 7)}
      {line((f) => f.legs[0])}
      {line((f) => f.arms[0])}
      {weight && dot((f) => f.hand, 4.5)}
    </>
  )
}

/**
 * How to do a strength exercise, shown by Taperday's runner: the same volt stick figure, now squatting, lunging and
 * planking. Moves loop through one rep; holds breathe. With reduced motion it stands still, showing the start of the
 * move faintly behind the working position. Decorative (aria-hidden): the written cues beside it carry the meaning.
 */
export function ExerciseFigure({ exercise, size = 96 }: Props) {
  const info = EXERCISES[exercise]
  const frames = info.frames.map(figure)
  const animate = prefersMotion()
  const holds = frames.length === 1
  const weight = info.weight ?? false

  return (
    <svg
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      width={(size * VIEW.width) / VIEW.height}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`runner exercise-figure${animate ? '' : ' is-still'}`}
      data-exercise={exercise}
    >
      <line className="exercise-floor" x1="4" y1={FLOOR + 4} x2={VIEW.width - 4} y2={FLOOR + 4} />
      {info.prop && (
        <rect
          x={info.prop.x}
          y={info.prop.y}
          width={info.prop.width}
          height={info.prop.height}
          rx="3"
          fill="currentColor"
          opacity="0.35"
          stroke="none"
        />
      )}
      {animate || holds ? (
        <g className={holds && animate ? 'runner-breathe' : undefined}>
          <Body frames={frames} seconds={info.seconds} weight={weight} />
        </g>
      ) : (
        <>
          <g opacity="0.3">
            <Body frames={[frames[0]!]} seconds={info.seconds} weight={weight} />
          </g>
          <Body frames={[frames[1]!]} seconds={info.seconds} weight={weight} />
        </>
      )}
    </svg>
  )
}
