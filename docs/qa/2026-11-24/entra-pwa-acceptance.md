# Entra External ID: staging sign-in and installed-PWA acceptance

**Date:** 24 November 2026
**Scope:** External ID sign-in, token acquisition, session recovery, PWA account isolation and production release safety.
**Target:** `staging`. This is the executable QA/handover for the separate Entra PR; it is **not** evidence that a live Microsoft sign-in has passed.

## Why this PR exists

A reported iPhone PWA could get stuck at **Checking your session**, then expose the race builder while signed out. PR #314 introduced a frontend session gate, but its test suite used synthetic MSAL identities. Real email-one-time-passcode, External ID callbacks, standalone iOS PWA navigation, and production tenant configuration were not verified.

One follow-up bug exists in `client/src/app/AuthProvider.tsx`: when `handleRedirectPromise()` resolves with an account but no access token, the previous condition skipped `acquireTokenSilent()` and the session gate stayed closed. A previous quiet-renewal marker could also prevent cache-based recovery on a subsequent visit. This PR fixes **silent token verification** while keeping any automatic **prompt=none redirect** limited to once per launch.

## Files and existing contracts to inspect first

- `client/src/app/AuthProvider.tsx`, `AppAuth.tsx`, `auth-context.ts`, `sign-in-requests.ts`, `sign-in-errors.ts`
- `client/src/app/AuthProvider.test.tsx`, `AppAuth.test.tsx`
- `client/src/lib/install-app.ts`, `client/public/sw.js`, `client/src/main.tsx`
- `src/StartLine.API/PresentationDependencyInjection.cs` and `src/StartLine.API/Infrastructure/Identity.cs`
- `docs/accounts-setup.md`, `docs/integration-validation.md`, `docs/device-validation.md`
- `.github/workflows/deploy-environment.yml`, `.github/workflows/release.yml`

Do not remove PR #314's protected training-app gate. Public privacy and unsubscribe links must remain usable without an account. Catalogue/plan-generation endpoints currently allow anonymous API requests for compatibility: **audit and document** that boundary, but do not change API authorization without an explicit compatibility plan.

## Claude Code handover — execute, not just comment

1. Check out this PR branch. Read the exact files above and the currently deployed staging commit. Find the complete flow: first visit → sign-in → redirect → handleRedirectPromise → acquire token → `sessionReady` → runner `/me` → saved plan. Identify every blank screen, redirect loop and stale-account state.
2. Validate the new account-only-redirect regression test. Add explicit tests for real token returned in redirect, missing token, silent refresh success/failure, prior quiet-renewal marker, offline, back/forward, double click, app relaunch, switching users, pending offline check-ins, and sign-out. Fail closed whenever a bearer token is unavailable.
3. Verify sign-in errors remain actionable. Never hide an `AADSTS...`/MSAL failure behind an endless spinner. Distinguish transient network failure, configuration error, cancelled sign-in and expired session; offer retry/Continue securely. Do not display raw tokens, email-code values, or sensitive identity response bodies.
4. Run `cd client && npm ci && npm run lint && npm run typecheck && npm test -- --run` (use commands actually supported by `package.json`, adjust if needed), followed by the Playwright browser matrix and backend CI. Do not weaken security checks, mark tests skipped or rewrite expectations just to get green.
5. On an owned **staging** External ID test account, execute the live matrix below and capture safe evidence. If automated browser access cannot complete real email-code sign-in, clearly label those cases **unverified** and request the owner to test them on a physical device; never claim synthetic MSAL mocks prove provider delivery.
6. Fix reproducible bugs **on this PR branch** with corresponding tests, then repeat end-to-end navigation: Home, Plan, Strength, Calendar, Runs, Account, Strava return, logout, and offline recovery in both themes on phone/tablet/desktop. Preserve the running cartoon, original colours, animations and responsive layout.
7. Update this document with pass/fail, tested commit, timestamps, screenshots (redact accounts), failure codes and root causes. Push all changes to this PR; keep the PR open for review. **Do not merge, trigger production release, alter tenant Conditional Access/security defaults, reset data or expose secrets.**

## Configuration/identity preflight (read-only)

Only check for presence and correctness in the **staging** GitHub environment and External ID tenant; never print values/secrets to logs.

| Layer | Required check |
|---|---|
| Client build | `VITE_AUTH_CLIENT_ID`, `VITE_AUTH_AUTHORITY`, `VITE_AUTH_SCOPE`, `VITE_API_BASE_URL` are present and target staging |
| Authority | External ID authority's path names the correct tenant, and `knownAuthorities` host matches |
| Web app | Correct **SPA** platform with callback and logout redirect URI for the actual staging origin; localhost only for local dev |
| API app | Valid `AzureAd:Instance`, `AzureAd:TenantId`, `AzureAd:ClientId`; expected audience and accepted token version |
| Delegated permission | `api://<api-client-id>/Plans.ReadWrite` matches Expose an API and the client scope |
| User flow | Staging web application is assigned; email one-time-passcode sign-in is enabled |
| Provider | Google button is shown only if `VITE_AUTH_GOOGLE=true` and Google is enabled on that actual user flow |
| Browser | MSAL redirect URI equals the PWA's browser origin; verify provider callback in both Safari tab and installed standalone mode |
| Server | No unauthenticated access to runner-owned `/api/v1/me` or `/api/v1/me/plans` endpoints |
| Operations | Staging API health/database ready; no production database, runner account or email campaign used as fixture |

**No tenant secrets, access/ID/refresh tokens, passcodes, authorization response URLs, personal emails or cookies belong in screenshots, PR comments or CI output.** If logs contain them, redact locally before upload.

## Results, 24 November 2026

**PR head tested:** `6667c77` (unit, lint, typecheck locally on the changed areas; full CI on the PR).
**Staging deployed:** `5d7a966` (#314). This PR is not on staging yet, so every live row below was run against `5d7a966`, not the PR head.

Evidence levels used in the matrix:

- **Live staging**: the real staging site or API, no mocks. Desktop Chromium unless stated. Signed-out checks only.
- **Unit**: Vitest with a mocked MSAL client. Proves the app's own logic, not Microsoft's behaviour.
- **NOT RUN**: needs the owner (real inbox, physical iPhone) or a staging deploy of this PR.

Playwright device profiles are not counted as iPhone evidence anywhere in this document.

### Defects fixed in `6667c77` (each has a regression test in `AuthProvider.test.tsx` or `sign-in-errors.test.ts`)

1. **Cancelled or failed return from Microsoft dropped a remembered runner to the first-visit page.** After tapping Continue securely and cancelling, `handleRedirectPromise` rejected and the app set no account. The runner lost the Continue securely card, and a later sign-in skipped the unsynced-drafts warning because the drafts' owner wasn't the account on screen. Now the remembered account is restored (training stays closed) and the error is shown.
2. **A launch with no MSAL account wiped unsynced drafts.** `activateCheckInOwner(null)` cleared every draft whenever MSAL no longer had an account (storage partly cleared, failed sign-in). Now only a known account takes over local data; sign-out and an explicit account switch still clear it.
3. **The drafts warning only counted the account on screen.** Sign-in and sign-out now count drafts of any owner on the device.
4. **An ended session was shown as "We couldn't sign you in".** On launch an `InteractionRequiredAuthError` is the normal Continue securely state and is no longer shown as an error; a network failure says offline.
5. **Set-up faults looked like a retryable glitch.** Redirect URI, tenant, wrong platform and API-scope codes now say sign-in isn't set up correctly and show the code. Network codes say to check the connection.
6. **Double tap on Continue securely could start a second interaction** (the guard was released as soon as navigation began). It now stays set until the page leaves or the call fails. Sign out is guarded the same way.
7. **Sign-out failure paths.** A rejected `logoutRedirect` was unhandled and left the "Welcome back" card for an account whose cache was already gone. Now the device always ends signed out (first-visit page) and a failure is shown. Offline, sign-out clears the device without trying to load Microsoft's page; the next sign-in still uses `select_account`.

No changes to the service worker were needed: it never caches API or identity responses, navigations are network-first, and the cache name was already rotated for the sign-in release.

### Configuration preflight (read-only, values not recorded)

| Check | Result |
|---|---|
| Staging GitHub variables `VITE_AUTH_CLIENT_ID`, `VITE_AUTH_AUTHORITY`, `VITE_AUTH_SCOPE`, `VITE_API_BASE_URL` present | PASS |
| `VITE_API_BASE_URL` equals the staging `API_URL` | PASS |
| Authority is an https `ciamlogin.com` tenant URL and its OpenID metadata resolves | PASS |
| API `AzureAd:Instance` host equals the client authority host | PASS |
| API `AzureAd:TenantId` matches the authority's issuer tenant | PASS |
| Client scope is exactly `api://<API AzureAd:ClientId>/Plans.ReadWrite` | PASS |
| API `AzureAd:Scope` | Unset, so the code default `Plans.ReadWrite` applies |
| API `AzureAd:Audience` | Unset, so Microsoft.Identity.Web accepts the API client ID. Correct, because the staging API app issues v2 tokens (next row) |
| Staging origin registered under the **Single-page application** platform on Taperday Web (staging) | PASS (owner screenshot, admin centre) |
| Taperday API (staging), the app whose client ID the staging API uses: `Plans.ReadWrite` exposed with `isEnabled: true`, `requestedAccessTokenVersion: 2` | PASS (owner screenshot of manifest; app ID compared locally, not recorded) |
| Taperday Web (staging) has delegated `Plans.ReadWrite` on Taperday API (staging), granted for the tenant | PASS (owner screenshot) |
| User flow "Taperday sign up and sign in v2" lists Taperday Web (staging); Email one-time passcode selected; Google ticked (`VITE_AUTH_GOOGLE` is `true` on staging) | PASS (owner screenshots) |

Graph and CLI reads failed because the tenant admin is a personal Microsoft account added as a guest (AADSTS50076, AADSTS500208, AADSTS90123). The registrations above were checked from admin-centre screenshots instead.

### Anonymous API surface (audited, not changed)

Runner-owned routes (`/api/v1/me*`) need a signed-in user with the `Plans.ReadWrite` scope (fallback policy). These opt out with `[AllowAnonymous]` on purpose:

| Route | Why public |
|---|---|
| `GET races`, `races/search`, `races/{slug}` | Race catalogue |
| `POST plans`, `GET plans/calendar.ics` | Anonymous plan generation and its calendar file (no stored runner data) |
| `GET predictions` | Pace predictions from inputs in the query |
| `GET calendar/{token}.ics` | Subscribed calendar, authorised by an unguessable token |
| `POST ticks` | "Tick it" from a notification, authorised by a single-session token |
| `POST unsubscribe` | Email unsubscribe links |
| `GET/POST webhooks/strava/{secret}` | Strava webhook, authorised by a path secret |
| `/health/live`, `/health/ready` | Monitoring |

OpenAPI and Scalar are mapped only in Development.

### Reproduce the live checks

1. E01/E02: open the staging site in a private window with no Taperday storage; load `/?view=home`, `/?view=plan`, `/?view=runs`, `/?view=account` and `/plan/anything`. Each must show "Your next run starts here." and no tab bar.
2. E17: load `/?view=privacy` and `/?view=unsubscribe&t=invalid` signed out. Both render; do not press Unsubscribe.
3. E18: `curl -s -o /dev/null -w '%{http_code}' <staging API>/api/v1/me` with no header and with `Authorization: Bearer not-a-token`. Both must be 401.

### Remaining risks

- Real email-code delivery, the installed iPhone PWA redirect return, reopen and sign-out are untested (E03, E04, E07, E11 live, E15).
- All live passes are on `5d7a966`; this PR's fixes need a staging deploy before they can be checked live.

## Live acceptance matrix — use a dedicated staging test account

Record each row as `PASS`, `FAIL` or `NOT RUN` with a concise observation and safe screenshot where useful. Real iOS **Add to Home Screen** testing cannot be substituted by Playwright's iPhone WebKit profile.

| ID | Scenario | Expected acceptance result | Result |
|---|---|---|---|
| E01 | Fresh browser, signed out, load `/?view=home` | Sign-in UI; no Home/Plan/Run data, build controls or private navigation | PASS: live staging @5d7a966, desktop Chromium, signed out. Sign-in page only, no tab bar or plan data. iPhone NOT RUN |
| E02 | Fresh browser, direct plan link, Runs, Account, and deep links | No protected content mounts without verified API token | PASS: live staging @5d7a966, desktop Chromium. `?view=plan`, `runs`, `account` and a `/plan/<id>` path all show the sign-in page, no navigation. iPhone NOT RUN |
| E03 | Sign up with a **new** staging email via one-time passcode | Email arrives, valid code completes login, initial onboarding appears once | NOT RUN (owner, real inbox) |
| E04 | Existing account email code login | Return to Taperday and load the *same account's* saved Home/plan; no endless spinner | NOT RUN (owner) |
| E05 | Redirect result with account but no token | Silent API-token acquisition attempted; sign-in gate opens only if token obtained | Unit PASS @6667c77 (token in redirect, account-only redirect, no token stays closed); live NOT RUN |
| E06 | Wrong or expired passcode, cancel, Back, duplicate tap, lost network | Visible recoverable error; no blank/looping screen or protected UI | Unit PASS @6667c77 (cancel, failed return with code, double tap, network failure). Wrong/expired passcode is on Microsoft's page: live NOT RUN |
| E07 | Close/reopen Safari and installed iPhone PWA, valid session | Quiet cached-token restoration succeeds; no extra email code if session remains valid | NOT RUN (owner, installed PWA) |
| E08 | Expired token, quiet provider renewal succeeds | Returns to intended page, no redirect loop or lost draft | Unit PASS @6667c77 (one quiet renewal per launch, no loop); live NOT RUN |
| E09 | Expired token, interactive renewal needed | One deliberate `Continue securely` action; never auto-redirect during run logging | Unit PASS @6667c77 (no automatic redirect from a background call; Continue securely only on tap); live NOT RUN |
| E10 | Offline launch with previously stored runner data | No private training without a usable session; offline drafts not silently discarded | Unit PASS @6667c77 (offline launch stays closed, says offline, keeps drafts); live NOT RUN |
| E11 | Sign out and reload | Previously displayed plan/Run/Account no longer visible, old account not silently revived | Unit PASS @6667c77 (sign-out clears device incl. offline and failed logout; double tap); live NOT RUN |
| E12 | Different account on same device | No first user's cached plan, runs, check-ins or photos accessible | Unit PASS @6667c77 (new account clears previous runner's drafts and MSAL accounts); live NOT RUN |
| E13 | Saved unsynced run, cancel sign-out or account switch | Draft remains; explicit discard clears only after consent | Unit PASS @6667c77 (cancelled sign-out, cancelled sign-in and lost MSAL account all keep drafts); live NOT RUN |
| E14 | Reconnect after offline, retry saved run | Data syncs exactly once and account ownership remains correct | Unit PASS (existing offline-check-ins suite); live NOT RUN |
| E15 | iPhone Safari vs installed PWA vs Android vs desktop | Correct redirects and session state across modes; no service-worker old shell | NOT RUN (owner) |
| E16 | Dark/light, reduced motion, narrow and desktop | Sign-in, error, retry and bottom nav readable, accessible and tap-safe | NOT RUN (covered by #317 visual pass) |
| E17 | Public privacy/unsubscribe links, signed out | Continue working without sign-in | PASS: live staging @5d7a966, signed out. Privacy policy renders; unsubscribe page renders (not submitted) |
| E18 | API `/api/v1/me` without token | 401; runner data never returned | PASS: live staging API, 24 Nov. `/api/v1/me` and `/api/v1/me/plans` return 401 with no token and with a junk bearer |
| E19 | Reload/app return from Strava connection | OAuth callback survives Entra gate; owner and data remain correct | NOT RUN |
| E20 | Provider outage / wrong tenant in staging | Human-readable failure or recoverable error, never infinite loading | Unit PASS @6667c77 (set-up codes such as AADSTS50011/700016/9002326/500011 get their own message and show the code); live NOT RUN |

### Manual test steps for the owner

1. Open the *staging* website in Safari **without signing in**. Try Home, Plan, Run and Account links; each must prompt for sign-in, without briefly flashing a training page.
2. Sign in using a dedicated test inbox and the actual email code. Verify you reach your own plan, not a race-builder spinner. Sign out and verify the gate appears again.
3. In Safari, Share → **Add to Home Screen**. Launch the installed PWA, sign in there, fully close and reopen. Repeat after toggling airplane mode and restoring connectivity.
4. With a logged-in plan, tick a safe test run and create an offline draft. Verify cancellation of sign-out does not discard it; after reconnect it saves exactly once.
5. Record safe evidence: device model, iOS version, test time, staging commit, browser/standalone, precise user action, visible error *code only*, screenshot **without personal identifiers**, and PASS/FAIL.

### Failure triage — where to investigate

- **No code email:** External ID user flow/email-code delivery, provider logs, junk filtering. Do not guess it is a frontend bug.
- **Redirect sent back but not signed in:** `handleRedirectPromise` result, API token scope/audience, `acquireTokenSilent`, sessionReady and runtime staging config.
- **Unending “Checking your session…”:** initialization/redirect promise unresolved; verify 12-second recovery UI, errors and PWA cached shell.
- **Works in Safari but fails when installed:** standalone origin/window behavior and redirect return; record whether the redirect opens Safari outside the PWA.
- **One user sees another's data:** stop testing immediately; treat as a privacy/security incident, preserve only redacted logs and block release.
- **Auth works but plan never loads:** API `/me`, `/plans`, database readiness, auth 401/403 vs timeout; do not mask a backend outage as signed-out.

## Release gate

- All CI and secret scanning green on this PR's **exact head SHA**.
- Live E01–E05, E07–E12, E15, E17–E18 validated on staging; other scenarios verified or failures explicitly resolved with evidence.
- Installed iPhone PWA can authenticate and **remains authenticated** appropriately, without exposed data on sign-out.
- If the owner cannot complete tenant/PWA checks, mark the PR blocked; **do not represent mocks or engine emulation as live acceptance**.
- Separate staging merge and staging post-merge CI/deployment must pass before production promotion. No production deployment is part of this PR.
