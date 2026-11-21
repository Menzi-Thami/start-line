import { afterEach, describe, expect, it } from 'vitest'
import { planFixture } from '../../test/server'
import { dismissRating, ratingWasDismissed } from './rating-dismissal'

afterEach(() => localStorage.clear())

describe('optional runner feedback dismissal', () => {
  const session = { date: '2026-10-20', type: 'Fartlek' } as const

  it('hides just the chosen plan and day, not the next workout or a different plan', () => {
    const plan = structuredClone(planFixture)
    const anotherPlan = { ...plan, race: { ...plan.race, slug: 'another-race-2026' } }
    expect(ratingWasDismissed(plan, session)).toBe(false)
    dismissRating(plan, session)
    expect(ratingWasDismissed(plan, session)).toBe(true)
    expect(ratingWasDismissed(plan, { date: '2026-10-21', type: 'Fartlek' })).toBe(false)
    expect(ratingWasDismissed(anotherPlan, session)).toBe(false)
    expect(ratingWasDismissed(plan, { date: '2026-10-20', type: 'Easy' })).toBe(false)
  })
})
