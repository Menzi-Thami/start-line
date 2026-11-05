import { describe, expect, it } from 'vitest'
import { couchTo5k, beginnerSessionSummary } from './couch-to-5k'

describe('Couch to 5K progression', () => {
  it('provides three sessions per week for nine weeks', () => {
    const all = couchTo5k()
    expect(all).toHaveLength(27)
    for (let week = 1; week <= 9; week++) {
      expect(all.filter(s => s.week === week).map(s => s.day)).toEqual([1, 2, 3])
    }
  })
  it('begins with walk breaks and a warmup and cooldown', () => {
    const first = couchTo5k()[0]!
    expect(first.blocks).toEqual([{ runSeconds: 60, walkSeconds: 90, repeats: 8 }])
    expect(first.warmUpSeconds).toBe(300)
    expect(first.coolDownSeconds).toBe(300)
    expect(first.totalSeconds).toBe(1800)
    expect(beginnerSessionSummary(first)).toContain('jog')
  })
  it('finishes with a 30-minute comfortable run', () => {
    const last = couchTo5k().at(-1)!
    expect(last.blocks).toEqual([{ runSeconds: 1800, walkSeconds: 0, repeats: 1 }])
    expect(last.totalSeconds).toBe(2400)
  })
})
