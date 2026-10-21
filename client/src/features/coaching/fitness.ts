import type { CoachNote } from '../../lib/types'

/** The latest call that said anything about the runner's paces: a fitness estimate, or a nudge. */
export function latestPaced(notes: CoachNote[] | undefined): CoachNote | undefined {
  return [...(notes ?? [])].reverse().find((n) => n.fitness || Math.abs(n.paceFactor - 1) > 0.0001)
}
