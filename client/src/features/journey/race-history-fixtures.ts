// Synthetic race memories for unit tests and browser fixtures, never shipped as a runner's data.
import { raceResult } from './journey-fixtures'
import type { MajorDefinition, RaceMemory } from './types'

export const majorDefinitions: MajorDefinition[] = [
  { id: 'Tokyo', name: 'Tokyo Marathon', city: 'Tokyo', originalSix: true, firstQualifyingYear: null },
  { id: 'Boston', name: 'Boston Marathon', city: 'Boston', originalSix: true, firstQualifyingYear: null },
  { id: 'London', name: 'London Marathon', city: 'London', originalSix: true, firstQualifyingYear: null },
  { id: 'Berlin', name: 'Berlin Marathon', city: 'Berlin', originalSix: true, firstQualifyingYear: null },
  { id: 'Chicago', name: 'Chicago Marathon', city: 'Chicago', originalSix: true, firstQualifyingYear: null },
  { id: 'NewYork', name: 'New York City Marathon', city: 'New York', originalSix: true, firstQualifyingYear: null },
  { id: 'Sydney', name: 'Sydney Marathon', city: 'Sydney', originalSix: false, firstQualifyingYear: 2025 },
  { id: 'CapeTown', name: 'Cape Town Marathon', city: 'Cape Town', originalSix: false, firstQualifyingYear: 2026 },
]

export function raceMemory(overrides: Partial<RaceMemory> = {}): RaceMemory {
  return { eventName: 'London Marathon', eventDistanceKm: 42.195, major: 'London', majorEligible: true, needsReview: false,
    result: raceResult({ planId: null, raceDate: '2026-04-26', distanceKm: 42.4, finishTime: '04:00:00', goalTime: null, versusGoal: null, timeKind: 'OfficialChip' }), ...overrides }
}
