import { afterEach, describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import { activateRatingOwner, clearRatingDismissals, dismissRating, ratingWasDismissed } from './rating-dismissal'

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

  it('belongs to one account: another runner on the same device still sees the prompt for the same race and day', () => {
    const plan = structuredClone(planFixture)
    activateRatingOwner('runner-a')
    dismissRating(plan, session)
    expect(ratingWasDismissed(plan, session)).toBe(true)
    activateRatingOwner('runner-a')
    expect(ratingWasDismissed(plan, session)).toBe(true)

    activateRatingOwner('runner-b')
    expect(ratingWasDismissed(plan, session)).toBe(false)
    activateRatingOwner('runner-a')
    expect(ratingWasDismissed(plan, session)).toBe(false)
  })

  it('is cleared on sign-out, including the earlier per-key format', () => {
    const plan = structuredClone(planFixture)
    activateRatingOwner('runner-a')
    dismissRating(plan, session)
    localStorage.setItem('taperday.rating.dismissed.old-race.2026-10-05.2026-10-20.Fartlek', '1')
    clearRatingDismissals()
    expect(ratingWasDismissed(plan, session)).toBe(false)
    expect(localStorage.getItem('taperday.rating.dismissed.old-race.2026-10-05.2026-10-20.Fartlek')).toBeNull()
    activateRatingOwner('runner-a')
    expect(ratingWasDismissed(plan, session)).toBe(false)
  })

  it('still lets the visit carry on when storage is unavailable', () => {
    const plan = structuredClone(planFixture)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    try {
      expect(() => activateRatingOwner('runner-a')).not.toThrow()
      expect(() => dismissRating(plan, session)).not.toThrow()
      expect(ratingWasDismissed(plan, session)).toBe(false)
    } finally { setItem.mockRestore() }
  })
})
