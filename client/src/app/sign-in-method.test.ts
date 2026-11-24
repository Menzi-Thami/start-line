import { describe, expect, it } from 'vitest'
import { signsInWithPassword } from './sign-in-method'

describe('signsInWithPassword', () => {
  it('is on only when VITE_AUTH_PASSWORDS is true', () => {
    expect(signsInWithPassword({})).toBe(false)
    expect(signsInWithPassword({ VITE_AUTH_PASSWORDS: '' })).toBe(false)
    expect(signsInWithPassword({ VITE_AUTH_PASSWORDS: 'yes' })).toBe(false)
    expect(signsInWithPassword({ VITE_AUTH_PASSWORDS: ' TRUE ' })).toBe(true)
  })
})
