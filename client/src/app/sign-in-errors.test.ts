import { AuthError, ServerError } from '@azure/msal-browser'
import { describe, expect, it } from 'vitest'
import { describeSignInError } from './sign-in-errors'

// As MSAL 5 builds them after a redirect: (code, correlation id, the server's description).
const fromServer = (code: string, message: string) => new ServerError('invalid_request', 'corr-1', `${code}: ${message} Trace ID: 1 Correlation ID: 2`)

describe('describeSignInError', () => {
  it('tells a runner to try again when the session ran out, without Microsoft’s jargon', () => {
    const problem = describeSignInError(fromServer('AADSTS50132', 'The session is not valid due the following reasons: SSO Artifact is invalid.'))

    expect(problem).toEqual({ message: 'Your sign-in timed out before it finished. Please try again.', code: 'AADSTS50132' })
  })

  it('never renders a Microsoft timeout link as user-facing copy', () => {
    const problem = describeSignInError(new AuthError('timed_out', 'See https://aka.ms/msal.js.errors#timed_out for details'))
    expect(problem.message).toBe('Your sign-in timed out before it finished. Please try again.')
    expect(problem.message).not.toContain('aka.ms')
  })

  it('says plainly when a social account couldn’t be set up', () => {
    const problem = describeSignInError(fromServer('AADSTS50020', "User account 'x@gmail.com' from identity provider 'google.com' does not exist."))

    expect(problem.message).toBe('We couldn’t create your account with that sign-in. Please try again, and contact us if it keeps happening.')
    expect(problem.code).toBe('AADSTS50020')
  })

  it('recognises MSAL’s own codes, such as a cancelled sign-in', () => {
    expect(describeSignInError(new AuthError('user_cancelled', 'corr-1'))).toEqual({
      message: 'Sign-in was cancelled. Try again whenever you’re ready.',
      code: 'user_cancelled',
    })
  })

  it('falls back to a plain message, keeping whatever code there is', () => {
    expect(describeSignInError(fromServer('AADSTS99999', 'Something new.'))).toEqual({ message: 'We couldn’t sign you in. Please try again.', code: 'AADSTS99999' })
    expect(describeSignInError(new Error('network down'))).toEqual({ message: 'We couldn’t sign you in. Please try again.', code: null })
  })

  it('tells apart an ended session, a network failure and a set-up fault', () => {
    expect(describeSignInError(new AuthError('login_required', 'x')).message).toBe('Your session has ended. Continue securely to sign in again.')
    expect(describeSignInError(new AuthError('no_network_connectivity', 'x')).message).toContain('Check your connection')
    for (const code of ['AADSTS50011', 'AADSTS700016', 'AADSTS9002326', 'AADSTS500011']) {
      const problem = describeSignInError(fromServer(code, 'Synthetic set-up fault.'))
      expect(problem.message).toContain('isn’t set up correctly')
      expect(problem.code).toBe(code)
    }
  })

  it('never puts Microsoft’s raw description in front of a runner', () => {
    const problem = describeSignInError(fromServer('AADSTS50011', "The redirect URI 'https://example.test' does not match."))
    expect(problem.message).not.toContain('example.test')
  })
})
