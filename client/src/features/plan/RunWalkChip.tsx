import type { RunWalk } from '../../lib/types'

/** 240 → "4:00", 30 → "0:30": how a watch's interval timer shows it. */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/**
 * Run/walk from the start, as a chip beside the session's name: the two numbers a runner sets on their watch. Sessions
 * run throughout, and plans saved before run/walk existed, have none and show nothing.
 */
export function RunWalkChip({ runWalk }: { runWalk?: RunWalk | null }) {
  if (!runWalk) return null
  return (
    <span className="chip chip-run-walk">
      <span className="visually-hidden">Run/walk from the start: </span>
      Run {clock(runWalk.runSeconds)} · Walk {clock(runWalk.walkSeconds)}
    </span>
  )
}
