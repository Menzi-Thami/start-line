# Remembered-session recovery — acceptance handoff

## Goal

Keep existing Entra External ID + MSAL authentication. A runner who opted to stay signed in should reopen Taperday's PWA and be restored silently whenever Microsoft can renew credentials. If interaction is necessary, Taperday **must not navigate to Microsoft from a background token request**. It must keep the remembered runner and device-only offline drafts and offer a deliberate **Continue securely** action.

## Implementation

- Keep the current `cacheLocation: 'localStorage'`, MSAL `initialize` / `handleRedirectPromise`, remembered active account, and `acquireTokenSilent`.
- When `acquireTokenSilent` raises `InteractionRequiredAuthError`, return no token; never call `acquireTokenRedirect` from `getToken`.
- A 401 from `/me` or unavailable interactive token for a *remembered* account now produces recoverable account state, not a signed-out visitor or onboarding/signup prompt.
- On the runner's tap, `resumeSession` calls `acquireTokenRedirect` for the **same account** and restores the current page on return. It does not clear the MSAL cache, sign out, choose another account, or delete drafts.
- Distinguish API/server errors from expired credentials. Offline continuation does not start an authentication redirect.
- Keep the existing manual sign-out confirmation for unsynced drafts, account-switch flow, Home snapshot, and light/dark themes.

## External tenant configuration (verify manually)

In Entra admin center → Taperday External ID tenant → the sign-up/sign-in user flow, check that the **Stay signed in?** prompt appears for eligible runners. Persistent browser-session settings in Conditional Access may override the default. Do not change tenant policy without review.

Microsoft: [External ID sign-up and sign-in user flows](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-sign-up-sign-in-customers) and [MSAL acquireTokenSilent](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/acquire-token).

No arbitrary 30-day guarantee: browser storage, the user declining persistence, sign-in frequency policies, refresh-token expiration, and iOS PWA behavior can all require interaction.

## Regression checklist

- [ ] Sign in with email OTP and accept **Stay signed in?**; close and reopen the installed iPhone PWA. Home should restore if silent token renewal succeeds, without an email code.
- [ ] Repeat on Android PWA and desktop browsers, with light and dark mode.
- [ ] Reopen with a valid cached account and Home snapshot while the API cold-starts; don't show a visitor sign-up screen or discard the copied plan.
- [ ] Simulate `InteractionRequiredAuthError` after token expiry. There must be **no automatic redirect**; one **Continue securely** action is visible and operable.
- [ ] Tap **Continue securely**. Redirect to Microsoft for the same account. If the identity-provider cookie still works, it may finish without an OTP; if not, OTP is expected. Return to the same view.
- [ ] With unsynced run check-ins, trigger expiry and tap continuation. Drafts must survive, and the runner must not be logged into a different account.
- [ ] Offline renewal must not redirect; user should be able to reconnect and continue.
- [ ] API 500/503/timeout must show account retry, **not** a forced reauthentication. Verify the paid SQL plan vs independent App Service cold start separately.
- [ ] Manual sign-out must still clear local authentication/snapshot only after the normal unsynced-draft confirmation.
- [ ] Test an account switch from a remembered runner and a completely new runner; do not leak another runner's saved Home or run drafts.
- [ ] CI: frontend `npm run lint`, `npm run typecheck`, `npm test`; Playwright iPhone/mobile + desktop; backend regression as configured by repository workflows.

## Release

Open a PR to `staging`; require green checks and real iPhone/Android verification before merging or deploying to production. Do not merge automatically.

## Quiet renewal when the app opens (19 November 2026)

Microsoft gives this app a sign-in that lasts 24 hours, fixed for single-page apps and email-code sign-in. When the app opens after that, `AuthProvider` first tries the stored tokens only (no hidden iframe, so no Safari timeout). If they've run out, it makes one top-level visit to Microsoft with `prompt=none`, which never shows a page:

- **Microsoft's session still alive** (the runner answered **Yes** to "Stay signed in?"): Microsoft sends straight back with new tokens. The runner sees a reload and stays signed in, with no code.
- **Session gone** (they answered No, signed out, or cleared site data): Microsoft sends back an error. The runner stays remembered on the device and **Continue securely** asks for the code when it's needed.
- At most once per app launch (marked in `sessionStorage`), never offline, and never on the way back from a sign-in. A failed check mid-task still waits for the runner's tap, as before.

The sign-in screen says: "When Microsoft asks, tap **Yes** to stay signed in, so you won't need a code next time."

Manual check on a real phone: sign in and tap Yes. Leave the app closed for more than 24 hours, then open it. You should see a brief reload, then your plan, with no code.
