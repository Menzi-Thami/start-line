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
  it('is the same with or without a recent result: it only feeds the outlook, and a saved plan doesn’t keep it', () => {
    const shown = toRequest({ ...inputs, recent: { km: 10, seconds: 3000, date: '2026-10-01' } })
    const saved = toRequest(inputs)

    expect(samePlan(shown, saved)).toBe(true)
  })

  it('is a different plan when an answer that shapes it differs', () => {
    expect(samePlan(toRequest(inputs), toRequest({ ...inputs, goalSeconds: 1440 }))).toBe(false)
  })
})
