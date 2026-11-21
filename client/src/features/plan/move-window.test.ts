import { describe, expect, it } from 'vitest'
import { canMoveFrom, canMoveTo, moveWindow } from './move-window'

// Week 1 starts Monday 23 November 2026, week 2 Monday 30 November.
const plan = { weeks: [{ startDate: '2026-11-23' }, { startDate: '2026-11-30' }] } as Parameters<typeof moveWindow>[0]

describe('the days a run can move', () => {
  it('before the plan starts, is the first week from its Monday, never the days before the plan', () => {
    expect(moveWindow(plan, '2026-11-21')).toEqual({ first: '2026-11-23', last: '2026-11-29' })
    expect(canMoveFrom(plan, '2026-11-21', '2026-11-24')).toBe(true)
    expect(canMoveTo(plan, '2026-11-21', '2026-11-25')).toBe(true)
    expect(canMoveTo(plan, '2026-11-21', '2026-11-22')).toBe(false)
    expect(canMoveFrom(plan, '2026-11-21', '2026-12-01')).toBe(false)
  })

  it('during the plan, is the rest of this week, from today', () => {
    expect(moveWindow(plan, '2026-11-25')).toEqual({ first: '2026-11-25', last: '2026-11-29' })
    expect(canMoveFrom(plan, '2026-11-25', '2026-11-24')).toBe(false)
    expect(canMoveFrom(plan, '2026-11-25', '2026-11-28')).toBe(true)
    expect(canMoveTo(plan, '2026-11-25', '2026-11-30')).toBe(false)
  })

  it('never reaches a run more than two weeks ahead', () => {
    const later = { weeks: [{ startDate: '2026-12-21' }] } as Parameters<typeof moveWindow>[0]
    expect(canMoveFrom(later, '2026-11-21', '2026-12-22')).toBe(false)
  })
})
