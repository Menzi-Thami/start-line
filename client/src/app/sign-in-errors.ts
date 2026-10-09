import { AuthError } from '@azure/msal-browser'

export interface SignInProblem {
  /** What happened and what to do, in plain words. */
  message: string
  /** Microsoft's code (for example AADSTS50132), kept so support can look it up. */
  code: string | null
}

// Grouped by what the runner should do next, not by Microsoft's reasons, which are written for administrators.
const KNOWN: { codes: readonly string[]; message: string }[] = [
  {
    codes: ['AADSTS50132', 'AADSTS50133', 'AADSTS50058', 'AADSTS16000', 'AADSTS700082', 'no_token_request_cache_error', 'state_mismatch', 'interaction_in_progress'],
    message: 'Your sign-in timed out before it finished. Please try again.',
  },
  {
    codes: ['user_cancelled', 'access_denied', 'AADB2C90091', 'AADSTS65004'],
    message: 'Sign-in was cancelled. Try again whenever you’re ready.',
  },
  {
    codes: ['AADSTS50020', 'AADSTS90072'],
    // Not "use your email instead": Microsoft sends a Gmail address straight back to Google.
    message: 'We couldn’t create your account with that sign-in. Please try again, and contact us if it keeps happening.',
  },
]

const FALLBACK = 'We couldn’t sign you in. Please try again.'

/** Turns whatever a failed sign-in threw into something a runner can act on. */
export function describeSignInError(error: unknown): SignInProblem {
  const errorCode = error instanceof AuthError ? error.errorCode : null
  // Where the server's "AADSTS..." text lands differs between MSAL versions, so look everywhere it might be.
  const text = error instanceof AuthError ? [error.errorCode, error.errorMessage, error.message].join(' ') : error instanceof Error ? error.message : String(error)
  const code = text.match(/AADSTS\d+|AADB2C\d+/)?.[0] ?? errorCode ?? null
  const known = KNOWN.find((k) => k.codes.some((c) => c === code || c === errorCode))
  return { message: known?.message ?? FALLBACK, code }
}
