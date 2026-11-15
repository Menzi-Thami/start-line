import { describe, expect, it } from 'vitest'
import { toRequest, type PlanInputs } from '../../lib/plan-url'
import { samePlan } from './useCurrentPlan'

const inputs: PlanInputs = {
  raceName: 'Parkrun PB',
  distanceKm: 5,
  raceDate: '2026-12-13',
  goalSeconds: 1470,
  runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'],
  longRunDay: 'Sunday',
  experience: 'Regular',
  strengthDays: [],
  planFrom: '2026-10-08',
  version: 2,
}

describe('the same plan', () => {
  it('enables saving when a recent result is added or removed, even though the workouts stay the same', () => {
    const shown = toRequest({ ...inputs, recent: { km: 10, seconds: 3000, date: '2026-10-01' } })
    const saved = toRequest(inputs)

    expect(samePlan(shown, saved)).toBe(false)
    expect(samePlan(saved, shown)).toBe(false)
    expect(samePlan(shown, { ...shown })).toBe(true)
    expect(samePlan(shown, { ...shown, recentResultTime: '00:49:00' })).toBe(false)
  })

  it('is a different plan when an answer that shapes it differs', () => {
    expect(samePlan(toRequest(inputs), toRequest({ ...inputs, goalSeconds: 1440 }))).toBe(false)
  })

  it('recognizes the default custom race name and ignores a catalogue snapshot when comparing live plans', () => {
    expect(samePlan(toRequest({ ...inputs, raceName: undefined }), toRequest({ ...inputs, raceName: 'Your race' }))).toBe(true)
    const catalogue = toRequest({ ...inputs, raceSlug: 'comrades-2027' })
    expect(samePlan(catalogue, { ...catalogue, raceName: 'Comrades Marathon', raceDate: '2027-06-13', distanceKm: 90 })).toBe(true)
  })
})
