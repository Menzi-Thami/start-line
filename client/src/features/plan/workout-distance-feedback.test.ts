import { describe, expect, it } from 'vitest'
import { compareWorkoutDistance } from './workout-distance-feedback'

describe('ephemeral workout distance feedback', () => {
  it('reports partial distance without claiming interval completion', () => {
    const result = compareWorkoutDistance(10, 5.05)
    expect(result.kind).toBe('recorded')
    if (result.kind !== 'recorded') return
    expect(result.fraction).toBeCloseTo(0.505)
    expect(result.differenceKm).toBeCloseTo(-4.95)
    expect(result.withinTolerance).toBe(false)
    expect(result.label).toContain('shorter than planned')
    expect(result.label).toContain('structure not assessed')
  })

  it('never treats a distance match as evidence of structured workout compliance', () => {
    const result = compareWorkoutDistance(10, 10)
    expect(result.kind).toBe('recorded')
    if (result.kind === 'recorded') {
      expect(result.withinTolerance).toBe(true)
      expect(result.label).toContain('structure not assessed')
    }
  })

  it('distinguishes longer runs without negative adherence penalties', () => {
    const result = compareWorkoutDistance(5, 8)
    expect(result.kind).toBe('recorded')
    if (result.kind === 'recorded') expect(result.label).toContain('longer than planned')
  })

  it.each([
    [undefined, 5],
    [0, 5],
    [-1, 5],
    [NaN, 5],
    [Infinity, 5],
    [5, undefined],
    [5, -1],
    [5, Infinity],
    [5, NaN],
  ])('does not manufacture evidence from missing or invalid input', (planned, recorded) => {
    expect(compareWorkoutDistance(planned, recorded).kind).toBe('unavailable')
  })
})
