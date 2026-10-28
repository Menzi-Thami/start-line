import { afterEach, describe, expect, it, vi } from 'vitest'
import { introFitsStartup, introSeen, markIntroSeen, prefersMotion } from './motion'

afterEach(() => {
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

const mediaQuery = (reduce: boolean) => vi.fn((query: string) => ({ matches: reduce && query.includes('reduce') }))

describe('prefersMotion', () => {
  it('is yes unless the device has asked for less motion', () => {
    vi.stubGlobal('matchMedia', mediaQuery(false))
    expect(prefersMotion()).toBe(true)

    vi.stubGlobal('matchMedia', mediaQuery(true))
    expect(prefersMotion()).toBe(false)
  })

  it('is no where the question can’t be asked, so nothing waits on an animation', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersMotion()).toBe(false)
  })
})

describe('the intro', () => {
  it('does not add an intro wait after a slow download', () => {
    expect(introFitsStartup(100)).toBe(true)
    expect(introFitsStartup(4000)).toBe(false)
  })
  it('plays once per visit', () => {
    expect(introSeen()).toBe(false)
    markIntroSeen()
    expect(introSeen()).toBe(true)
  })
})
