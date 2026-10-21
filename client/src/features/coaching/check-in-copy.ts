import type { BodyArea, CheckInStatus, PainLevel, SessionType } from '../../lib/types'

/** The 1–10 effort scale in words, so "6" means the same to everyone. */
export const EFFORT_WORDS: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Easy, chatty',
  4: 'Comfortable',
  5: 'Steady',
  6: 'Working',
  7: 'Hard',
  8: 'Very hard',
  9: 'Near my limit',
  10: 'All out',
}

/**
 * How each kind of run should feel on that scale. The coach compares what the runner felt with this: an easy run at 7
 * says something different from a tempo at 7.
 */
export const EXPECTED_EFFORT: Record<SessionType, string | null> = {
  Easy: '2–4',
  Recovery: '2–3',
  EasyWithStrides: '3–4',
  Hills: '7–8',
  Fartlek: '6–8',
  Intervals: '7–8',
  Tempo: '6–7',
  CruiseIntervals: '6–7',
  ProgressionRun: '5–7',
  RacePace: '6–8',
  MediumLongRun: '3–5',
  LongRun: '3–5',
  LongRunFastFinish: '4–6',
  LongRunRacePace: '5–7',
  Shakeout: '2–3',
  Race: null,
  Strength: null,
}

export const STATUSES: readonly { value: CheckInStatus; label: string }[] = [
  { value: 'Done', label: 'Done' },
  { value: 'CutShort', label: 'Cut short' },
  { value: 'SwappedForEasy', label: 'Ran easy instead' },
  { value: 'Skipped', label: 'Skipped' },
]

export const PAIN: readonly { value: PainLevel; label: string }[] = [
  { value: 'None', label: 'No' },
  { value: 'Niggle', label: 'A niggle' },
  { value: 'ChangedRunning', label: 'It changed how I ran' },
]

export const BODY_AREAS: Record<BodyArea, string> = {
  Foot: 'Foot',
  Ankle: 'Ankle',
  Achilles: 'Achilles',
  Calf: 'Calf',
  Shin: 'Shin',
  Knee: 'Knee',
  Hamstring: 'Hamstring',
  Quad: 'Thigh (quad)',
  Hip: 'Hip',
  Glute: 'Glute',
  LowerBack: 'Lower back',
  Other: 'Somewhere else',
}

/** One line for a check-in that's been made: "Done · felt 6/10, working · a niggle in the calf". */
export function checkInSummary(c: { status: CheckInStatus; effort: number | null; pain: PainLevel; painArea: BodyArea | null }): string {
  const parts = [STATUSES.find((s) => s.value === c.status)?.label ?? c.status]
  if (c.effort !== null) parts.push(`felt ${c.effort}/10, ${EFFORT_WORDS[c.effort]?.toLowerCase()}`)
  if (c.pain !== 'None') {
    const where = c.painArea ? ` (${BODY_AREAS[c.painArea].toLowerCase()})` : ''
    parts.push(c.pain === 'Niggle' ? `a niggle${where}` : `pain${where}`)
  }
  return parts.join(' · ')
}
