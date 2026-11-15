import { describe, expect, it } from 'vitest'
import { raceMemory } from './race-history-fixtures'
import { SA_RACES, southAfricanFinish } from './sa-races'

describe('South African race cabinet', () => {
  const mandela = SA_RACES.find(race => race.id === 'nelson-mandela')!

  it('recognises a confirmed Mandela Marathon even under its shorter name', () => {
    const saved = raceMemory({ eventName: 'Mandela Marathon', eventDistanceKm: 42.195, major: null, majorEligible: false })
    expect(southAfricanFinish(mandela, [saved])).toBe(saved)
  })

  it('does not award medals from an unrelated race, a DNF, or duplicate results awaiting review', () => {
    expect(southAfricanFinish(mandela, [raceMemory({ eventName: 'London Marathon', eventDistanceKm: 42.195 })])).toBeUndefined()
    expect(southAfricanFinish(mandela, [raceMemory({ eventName: 'Nelson Mandela Bay Marathon', eventDistanceKm: 42.195 })])).toBeUndefined()
    expect(southAfricanFinish(mandela, [raceMemory({ eventName: 'Nelson Mandela Marathon', eventDistanceKm: 42.195, result: { ...raceMemory().result, outcome: 'DidNotFinish' } })])).toBeUndefined()
    expect(southAfricanFinish(mandela, [raceMemory({ eventName: 'Nelson Mandela Marathon', eventDistanceKm: 42.195, needsReview: true })])).toBeUndefined()
  })
})
