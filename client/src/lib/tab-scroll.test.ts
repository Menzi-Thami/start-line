import { describe, expect, it } from 'vitest'
import { revealDelta, tabFade } from './tab-scroll'

describe('tabFade', () => {
  it('has no fade when every tab fits', () => {
    expect(tabFade(0, 360, 360)).toBe('none')
    expect(tabFade(0, 360, 361)).toBe('none')
  })

  it('fades the end at the start of a row that overflows', () => {
    expect(tabFade(0, 360, 520)).toBe('end')
  })

  it('fades both edges in the middle', () => {
    expect(tabFade(80, 360, 520)).toBe('both')
  })

  it('fades the start once the last tab is reached', () => {
    expect(tabFade(160, 360, 520)).toBe('start')
    expect(tabFade(159.4, 360, 520)).toBe('start')
  })
})

describe('revealDelta', () => {
  const list = { left: 0, right: 360 }

  it('leaves a tab that is clear of both edges alone', () => {
    expect(revealDelta(list, { left: 100, right: 200 })).toBe(0)
  })

  it('scrolls towards the end for a tab cut off or under the fade there', () => {
    expect(revealDelta(list, { left: 300, right: 420 })).toBe(88)
    expect(revealDelta(list, { left: 250, right: 340 })).toBe(8)
  })

  it('scrolls back for a tab cut off or under the fade at the start', () => {
    expect(revealDelta(list, { left: -40, right: 60 })).toBe(-68)
    expect(revealDelta(list, { left: 10, right: 90 })).toBe(-18)
  })

  it('measures from where the row sits on the page, not from zero', () => {
    expect(revealDelta({ left: 20, right: 380 }, { left: 320, right: 440 })).toBe(88)
  })
})
