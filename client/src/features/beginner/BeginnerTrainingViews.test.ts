import { describe, expect, it } from 'vitest'
import { defaultBeginnerProgress } from './beginner-progress'
import { beginnerTrainingStatus, beginnerWeekSummary } from './beginner-training-status'

describe('beginner training calendar and progress', () => {
  it('keeps runner-confirmed and cached recordings separate', () => {
    const progress = { ...defaultBeginnerProgress('2026-11-02'), completed: ['0:1:1'] }
    const recorded = new Set(['0:1:1', '0:1:2'])
    expect(beginnerTrainingStatus(progress, 1, 1, recorded)).toBe('confirmed')
    expect(beginnerTrainingStatus(progress, 1, 2, recorded)).toBe('recorded')
    expect(beginnerTrainingStatus(progress, 1, 3, recorded)).toBe('planned')
    expect(beginnerWeekSummary(progress, 1, recorded)).toEqual({
      confirmed: 1, provisional: 1, remaining: 1, total: 3,
    })
  })

  it('does not turn expired recordings into a durable confirmation', () => {
    const progress = defaultBeginnerProgress('2026-11-02')
    expect(beginnerWeekSummary(progress, 1, new Set(['0:1:2'])).provisional).toBe(1)
    // When the Strava cache expires, the match set is empty.
    expect(beginnerWeekSummary(progress, 1, new Set()).provisional).toBe(0)
    expect(beginnerWeekSummary(progress, 1, new Set()).remaining).toBe(3)
  })

  it('counts resumed and repeated weeks independently and honours revision', () => {
    const progress = { ...defaultBeginnerProgress('2026-11-02'), revision: 2, completed: ['0:1:1', '2:2:1'] }
    expect(beginnerWeekSummary(progress, 1, new Set()).confirmed).toBe(0)
    expect(beginnerWeekSummary(progress, 2, new Set()).confirmed).toBe(1)
    expect(beginnerWeekSummary(progress, 9, new Set()).remaining).toBe(3)
  })
})
