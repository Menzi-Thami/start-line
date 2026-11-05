/** A gentle nine-week programme for first-time runners.
 * Each week has three sessions separated by rest days.
 * Times are seconds and each session includes five minutes walking
 * before and after its work blocks.
 */
export interface BeginnerBlock {
  runSeconds: number
  walkSeconds: number
  repeats: number
}
export interface BeginnerSession {
  week: number
  day: 1 | 2 | 3
  warmUpSeconds: number
  coolDownSeconds: number
  blocks: readonly BeginnerBlock[]
  totalSeconds: number
}

const weeks: readonly (readonly BeginnerBlock[])[] = [
  [{ runSeconds: 60, walkSeconds: 90, repeats: 8 }],
  [{ runSeconds: 90, walkSeconds: 120, repeats: 6 }],
  [{ runSeconds: 90, walkSeconds: 90, repeats: 2 }, { runSeconds: 180, walkSeconds: 180, repeats: 2 }],
  [{ runSeconds: 180, walkSeconds: 90, repeats: 2 }, { runSeconds: 300, walkSeconds: 150, repeats: 2 }],
  [{ runSeconds: 300, walkSeconds: 180, repeats: 3 }],
  [{ runSeconds: 480, walkSeconds: 180, repeats: 2 }],
  [{ runSeconds: 900, walkSeconds: 180, repeats: 2 }],
  [{ runSeconds: 1500, walkSeconds: 0, repeats: 1 }],
  [{ runSeconds: 1800, walkSeconds: 0, repeats: 1 }],
]

export function couchTo5k(): BeginnerSession[] {
  return weeks.flatMap((blocks, index) => ([1, 2, 3] as const).map(day => ({
    week: index + 1,
    day,
    warmUpSeconds: 300,
    coolDownSeconds: 300,
    blocks,
    totalSeconds: 600 + blocks.reduce((sum, block) =>
      sum + (block.runSeconds + block.walkSeconds) * block.repeats, 0),
  })))
}

export function beginnerSessionSummary(session: BeginnerSession): string {
  return session.blocks.map(b =>
    b.walkSeconds > 0
      ? `${b.repeats} × (${b.runSeconds / 60} min jog + ${b.walkSeconds / 60} min walk)`
      : `${b.runSeconds / 60} min easy jog`,
  ).join(' · ')
}
