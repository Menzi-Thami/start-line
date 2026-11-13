import { describe, expect, it } from 'vitest'
import { readAuthConfig } from './auth-context'
import { signInRequest } from './sign-in-requests'

const SCOPE = 'api://taperday/Plans.ReadWrite'
const PAGE = 'https://taperday.run/?view=sign-in'

describe('what each sign-in button asks Microsoft for', () => {
  it('lets the runner choose a different email instead of locking in the remembered one', () => {
    const request = signInRequest('sign-in', SCOPE, PAGE)
    // MSAL drops its account hint only for select_account, so Microsoft's email box stays editable.
    expect(request.prompt).toBe('select_account')
    expect(request).not.toHaveProperty('loginHint')
    expect(request).not.toHaveProperty('account')
    expect(request).not.toHaveProperty('domainHint')
    expect(request.scopes).toEqual([SCOPE])
    expect(request.redirectStartPage).toBe(PAGE)
  })

  it('opens Google directly, still letting the runner pick which Google account', () => {
    const request = signInRequest('google', SCOPE, PAGE)
    expect(request.domainHint).toBe('google.com')
    expect(request.prompt).toBe('select_account')
    expect(request.redirectStartPage).toBe(PAGE)
  })

  it('keeps sign-up opening on create account, with no remembered account attached', () => {
    const request = signInRequest('sign-up', SCOPE, PAGE)
    expect(request.prompt).toBe('create')
    expect(request).not.toHaveProperty('account')
    expect(request).not.toHaveProperty('loginHint')
  })
})

describe('the Google switch', () => {
  const base = { VITE_AUTH_CLIENT_ID: 'web', VITE_AUTH_AUTHORITY: 'https://taperday.ciamlogin.com/tenant/', VITE_AUTH_SCOPE: SCOPE }

  it('stays off unless VITE_AUTH_GOOGLE is true', () => {
    expect(readAuthConfig(base)?.google).toBe(false)
    expect(readAuthConfig({ ...base, VITE_AUTH_GOOGLE: '' })?.google).toBe(false)
    expect(readAuthConfig({ ...base, VITE_AUTH_GOOGLE: 'yes' })?.google).toBe(false)
    expect(readAuthConfig({ ...base, VITE_AUTH_GOOGLE: ' TRUE ' })?.google).toBe(true)
  })

  it('never turns accounts on by itself', () => {
    expect(readAuthConfig({ VITE_AUTH_GOOGLE: 'true' })).toBeNull()
  })
})
