import type { RaceMemory } from './types'

// Recognisable South African finish lines, not official race registrations or results.
// Dates are deliberately not guessed; a runner confirms the event and their recorded activity.
export const SA_RACES = [
  { id: 'nelson-mandela', name: 'Nelson Mandela Marathon', distanceKm: 42.195, place: 'KwaZulu-Natal', aliases: ['Mandela Marathon'] },
  { id: 'two-oceans-ultra', name: 'Two Oceans Ultra Marathon', distanceKm: 56, place: 'Cape Town', aliases: ['Two Oceans Marathon', 'Two Oceans Ultra'] },
  { id: 'two-oceans-half', name: 'Two Oceans Half Marathon', distanceKm: 21.0975, place: 'Cape Town', aliases: [] },
  { id: 'comrades', name: 'Comrades Marathon', distanceKm: 90, place: 'KwaZulu-Natal', aliases: ['Comrades'] },
  { id: 'cape-town', name: 'Cape Town Marathon', distanceKm: 42.195, place: 'Cape Town', aliases: ['Sanlam Cape Town Marathon'] },
  { id: 'soweto', name: 'Soweto Marathon', distanceKm: 42.195, place: 'Soweto', aliases: [] },
  { id: 'knysna', name: 'Knysna Forest Marathon', distanceKm: 42.195, place: 'Knysna', aliases: [] },
  { id: 'om-die-dam', name: 'Om Die Dam Ultra Marathon', distanceKm: 50, place: 'Hartbeespoort', aliases: ['Om Die Dam'] },
] as const

export type SouthAfricanRace = (typeof SA_RACES)[number]

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// A finish belongs in a named collection only when its SAVED event name and distance match.
// A 42 km Strava recording by itself cannot establish which marathon took place.
export function southAfricanFinish(event: SouthAfricanRace, races: readonly RaceMemory[]): RaceMemory | undefined {
  const names: readonly string[] = [event.name, ...event.aliases]
  return races.find(race => race.result.outcome === 'Finished' && !race.needsReview
    && race.eventDistanceKm != null && Math.abs(race.eventDistanceKm - event.distanceKm) < 1
    && names.some(name => normalise(name) === normalise(race.eventName)))
}
