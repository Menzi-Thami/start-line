import { describe, expect, it } from 'vitest'
import { allowsSwipe, horizontalSwipe } from './swipe'

describe('horizontal swipe', () => {
  it('leaves native controls, editable content, calendars and charts in control of their own gestures', () => {
    for (const html of ['<button><span>Run</span></button>', '<input type="range">', '<div contenteditable="true">Goal</div>', '<div role="slider"><span>Week</span></div>', '<section class="plan-calendar"><span>12</span></section>']) {
      const container = document.createElement('div')
      container.innerHTML = html
      expect(allowsSwipe(container.querySelector('span') ?? container.firstElementChild)).toBe(false)
    }
    expect(allowsSwipe(document.createElement('p'))).toBe(true)
  })
  it('recognises deliberate left and right slides', () => {
    expect(horizontalSwipe({ x: 180, y: 100 }, { x: 80, y: 112 })).toBe(1)
    expect(horizontalSwipe({ x: 80, y: 100 }, { x: 180, y: 105 })).toBe(-1)
  })

  it('ignores small movements and normal vertical scrolling', () => {
    expect(horizontalSwipe({ x: 100, y: 100 }, { x: 75, y: 101 })).toBe(0)
    expect(horizontalSwipe({ x: 100, y: 100 }, { x: 10, y: 260 })).toBe(0)
  })
})
