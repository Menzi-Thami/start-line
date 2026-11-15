import { describe, expect, it } from 'vitest'
import { raceMemory } from './race-history-fixtures'
import { SA_RACES, southAfricanFinish, likelyEditionRecording } from './sa-races'
import type { ActivitySummary } from '../../lib/types'

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

describe('race-day Strava suggestions', () => {
  const event = SA_RACES.find(race => race.id === 'nelson-mandela')!
  const run = { id: 'strava-42', kind: 'Run', localDate: '2026-10-18', distanceKm: 42.3, movingSeconds: 15200, source: { kind: 'Strava' } } as ActivitySummary
  it('suggests the documented 18 October Cape Town marathon from an eligible stored recording', () => {
    expect(likelyEditionRecording(event, [run], [])).toEqual(run)
  })
  it('refuses different dates, ambiguous records, completed results or a recording already linked to another race', () => {
    expect(likelyEditionRecording(event, [{ ...run, localDate: '2026-10-19' }], [])).toBeNull()
    expect(likelyEditionRecording(event, [run, { ...run, id: 'another' }], [])).toBeNull()
    expect(likelyEditionRecording(event, [run], [raceMemory({ eventName: 'Nelson Mandela Marathon', eventDistanceKm: 42.195, result: { ...raceMemory().result, raceDate: '2026-10-18' } })])).toBeNull()
    expect(likelyEditionRecording(event, [run], [raceMemory({ eventName: 'Other marathon', result: { ...raceMemory().result, activityId: run.id } })])).toBeNull()
  })
})
