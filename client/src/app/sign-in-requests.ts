import type { RedirectRequest } from '@azure/msal-browser'

export type SignInKind = 'sign-in' | 'sign-up' | 'google'

/**
 * What each sign-in button asks Microsoft for.
 *
 * A button press is the runner choosing who to be, so it never presumes the account this device remembers. Left alone,
 * MSAL hints the remembered account and Microsoft's page shows that email locked, with no way to type another one.
 * `select_account` makes MSAL drop the hint and lets Microsoft offer "use another account" over any session it holds.
 * Sign-up's `create` can't be combined with it, so the provider also forgets the active account before any of these.
 *
 * `google` goes straight to Google (External ID's issuer acceleration) with domain_hint=google.com: the tenant rejects the
 * lowercase `google` that Microsoft's docs show (AADSTS90023, seen 13 Nov 2026). It only works once Google is added to the
 * tenant's user flow, so the button shows only when VITE_AUTH_GOOGLE is true (docs/accounts-setup.md).
 */
export function signInRequest(kind: SignInKind, scope: string, startPage: string): RedirectRequest {
  const base = { scopes: [scope], redirectStartPage: startPage }
  switch (kind) {
    case 'sign-in':
      return { ...base, prompt: 'select_account' }
    case 'google':
      return { ...base, prompt: 'select_account', domainHint: 'google.com' }
    case 'sign-up':
      return { ...base, prompt: 'create' }
  }
}
