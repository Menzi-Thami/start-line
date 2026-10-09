import { describe, expect, it } from 'vitest'
import plan5k from '../test/fixtures/plan-5k.json'
import { dayKind, planProgress } from './plan-day'
import type { TrainingPlan } from './types'

// A 5K plan from Monday 12 October to race day on Sunday 13 December 2026.
const plan = plan5k as TrainingPlan

describe('dayKind', () => {
  it('knows the plan hasn’t started yet', () => {
    expect(dayKind(plan, '2026-10-08')).toBe('before')
  })

  it('tells a training day from a rest day', () => {
    expect(dayKind(plan, '2026-10-13')).toBe('training') // hill repeats
    expect(dayKind(plan, '2026-10-14')).toBe('rest') // nothing scheduled
  })

  it('knows race day, and that the race is done after it', () => {
    expect(dayKind(plan, '2026-12-13')).toBe('race')
    expect(dayKind(plan, '2026-12-14')).toBe('after')
  })
})

describe('planProgress', () => {
  it('starts empty, counting down to the start', () => {
    expect(planProgress(plan, '2026-10-08')).toMatchObject({ fraction: 0, daysToStart: 4, daysToGo: 66 })
  })

  it('closes a little more every day and completely on race day', () => {
    const early = planProgress(plan, '2026-10-20').fraction
    const later = planProgress(plan, '2026-11-20').fraction
    expect(early).toBeGreaterThan(0)
    expect(later).toBeGreaterThan(early)
    expect(planProgress(plan, '2026-12-13')).toMatchObject({ fraction: 1, daysToGo: 0 })
  })
})
