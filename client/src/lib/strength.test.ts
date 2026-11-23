import { describe, expect, it } from 'vitest'
import { isStrength, strengthMinutes, strengthSummary } from './strength'

const exercise = { exercise: 'Squat', sets: 3, reps: 10, unit: 'Reps', summary: '3 × 10 squats' } as const

describe('strength', () => {
  it('reads the minutes from the start of the detail', () => {
    expect(strengthMinutes({ detail: 'About 30 min. Work down the list in order.' })).toBe(30)
    expect(strengthMinutes({ detail: 'Work down the list.' })).toBeNull()
  })

  it('sums a session up in one line', () => {
    expect(strengthSummary({ detail: 'About 20 min. Keep it light.', exercises: [exercise, exercise] })).toBe('2 exercises · about 20 min')
    expect(strengthSummary({ detail: 'Keep it light.', exercises: [exercise] })).toBe('1 exercise')
  })

  it('tells strength from a run', () => {
    expect(isStrength({ type: 'Strength' })).toBe(true)
    expect(isStrength({ type: 'Tempo' })).toBe(false)
  })
})
