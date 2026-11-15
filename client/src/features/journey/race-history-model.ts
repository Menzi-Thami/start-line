import { clockSeconds } from './journey-model'
import type { RaceMemory } from './types'

export const timeSource = (memory: RaceMemory) => memory.result.timeKind === 'OfficialChip' ? 'Official chip time'
  : memory.result.timeKind === 'RecordedElapsed' ? 'Recording elapsed time' : 'Finish time · source not specified'

/** Compare like with like: chip times at an advertised standard distance, never GPS distance or moving time. */
export function personalBests(races: readonly RaceMemory[]): Set<string> {
  const best = new Map<number, RaceMemory>()
  for (const race of races) {
    if (race.needsReview || race.result.outcome !== 'Finished' || race.result.timeKind !== 'OfficialChip') continue
    const seconds = clockSeconds(race.result.finishTime)
    const distance = [5, 10, 21.0975, 42.195].find(km => race.eventDistanceKm != null && Math.abs(race.eventDistanceKm - km) < .03)
    if (seconds === null || seconds <= 0 || distance === undefined) continue
    const previous = best.get(distance)
    if (!previous || seconds < (clockSeconds(previous.result.finishTime) ?? Infinity)) best.set(distance, race)
  }
  return new Set([...best.values()].map(race => race.result.id))
}
