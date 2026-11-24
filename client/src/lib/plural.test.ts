import { describe, expect, it } from 'vitest'
import { count } from './plural'

describe('count', () => {
  it('says 1 in the singular and 0 or many in the plural', () => {
    expect(count(0, 'run')).toBe('0 runs')
    expect(count(1, 'run')).toBe('1 run')
    expect(count(2, 'run')).toBe('2 runs')
    expect(count(1, 'day')).toBe('1 day')
    expect(count(7, 'day')).toBe('7 days')
  })

  it('takes an irregular plural', () => {
    expect(count(1, 'entry', 'entries')).toBe('1 entry')
    expect(count(3, 'entry', 'entries')).toBe('3 entries')
  })

  it('keeps a phrase together', () => {
    expect(count(1, 'confirmed training run')).toBe('1 confirmed training run')
    expect(count(12, 'confirmed training run')).toBe('12 confirmed training runs')
  })
})
