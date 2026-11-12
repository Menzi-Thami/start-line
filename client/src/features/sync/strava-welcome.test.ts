import { afterEach, describe, expect, it } from 'vitest'
import { beginStravaWelcome, finishStravaWelcome, hasStravaWelcome } from './strava-welcome'

afterEach(() => window.sessionStorage.clear())

describe('new runner Strava welcome', () => {
  it('remembers the return plan through an OAuth page change, then clears it when finished', () => {
    beginStravaWelcome('runner-1', '?race=half&date=2027-03-01')
    expect(hasStravaWelcome('runner-1')).toBe(true)
    expect(hasStravaWelcome('runner-2')).toBe(false)
    expect(finishStravaWelcome('runner-1')).toBe('?race=half&date=2027-03-01')
    expect(hasStravaWelcome('runner-1')).toBe(false)
  })

  it('supports a new runner without a plan link', () => {
    beginStravaWelcome('runner-1', '')
    expect(finishStravaWelcome('runner-1')).toBe('?')
    expect(finishStravaWelcome('runner-1')).toBe('')
  })
})
