# Taperday runner-motion loading and performance QA — Claude implementation handover
Date: 24 November 2026 · Target branch: `ux/runner-loading-performance-qa` → `staging`

## Product intent

**Users should feel they are still in Taperday while the app works, not stranded on a generic spinner.** Preserve the actual Taperday runner/cartoon, night-run palette, light and dark themes, typography, bottom navigation and existing full plan-builder five-scene film. Make the app **genuinely faster** where possible; animation is a graceful way to communicate *real* waits, not permission to add delays or cover indefinitely stuck calls.

This branch already introduces a small reusable `RunnerLoading` and replaces a first set of text/skeleton/spinner waits on account handoff, Runs, run analysis, lazy screen chunks and opening a saved plan. Do not overwrite those changes or PR #315's separate Entra authentication work. Build outward from the merged staging branch and resolve conflicts carefully.

## Findings from the code audit — verified, not visual claims

| Surface | Current code | Problem to evaluate |
|---|---|---|
| Initial HTML boot | `client/index.html`, `client/public/boot.css` | Static boot may remain during slow JS or auth. Test normal/cached/offline PWA and browser, especially iPhone |
| Auth initialization | `AppAuth.tsx`, `ConnectingAccount.tsx`, `AuthProvider.tsx` | Auth gate has existing running track and a slow/reload message, but startup and redirect can still feel like a dead end. Coordinate **auth logic** with PR #315 |
| Account API waking | `SignInWait.tsx`, `useWakeStep.ts`, `wait-film.ts` | Existing runner warm-up begins after a 6-second slow threshold and includes genuine health-check phases; ensure no unnecessary health polling, false status or repeated timers |
| Post-login plan handoff | `FindingPlan.tsx` | Previously a small generic spinner; now uses shared runner with retry/sign-out for slower waits. Test whether it leaves the page usable |
| Home/current chapter | `Home.tsx`, `TodayFocus.tsx`, `useHomePlan`, `useCurrentPlan` | Generic chapter/plan skeletons can appear despite cached data; check whether a legitimate stale copy could be shown with honest status without flashing another user's data |
| Runs list | `MyRuns.tsx`, `useSyncedRuns` | Previously two grey skeletons; initial branch uses branded runner. Avoid replacing content during background refresh if records are already present |
| Run analysis | `ActivityPage.tsx`, `RunDataPanel.tsx` | Previously a plain “Loading your run…” line; new runner wait introduced. Ensure return/back remains usable and a failed request offers Retry |
| Totals, journeys, race history | `RunningTotals.tsx`, `JourneyPage.tsx`, `RunningJourney.tsx`, `useRaceHistory.ts` | Uneven loading/error/recovery states; preserve last successfully loaded data where allowed |
| Onboarding / race catalog | `BuilderForm.tsx`, `App.tsx` | Network startup must not block a manual race. Keep fixed phone CTA visible and preserve user-entered answers |
| Plan generation film | `PlanTheatre.tsx`, `plan-theatre.ts`, `App.tsx` | Film is **17.5 seconds by deliberate brand design** and the user previously requested the complete story. Do not silently shorten or lengthen it; ensure it begins immediately after Build Plan, API executes concurrently and no extra loader appears underneath |
| Generic route fallback | `App.tsx` Suspense and saved-plan state | Previously generic skeletons; this branch uses runner. Verify rapidly switching views can't leave an obsolete loader stuck |
| Server / infrastructure | `api-client.ts`, `useRunner.ts`, `docs/deploy.md` | Read timeout is 60 seconds with one retry for retryable reads; a cold API/database may feel extremely slow. Diagnose cause before changing timeouts; staging may use serverless SQL, production differs |

## Motion design system (reuse brand, do not redesign it)

- **Small wait** (inline, localized; e.g., Runs tiles or run analysis): small running cartoon + moving two-tone track + one truthful sentence. No modal takeover, no page navigation block, and preserve Back/Retry controls.
- **Full-page wait** (initial auth or hard navigation only): centred existing runner, readable title, optional context (“Opening your training”, “Checking your recorded runs”), quiet branded track. The animation is not a clock or progress indicator.
- **Long wait** (actual API/database/network delay): transition to helpful phase-specific copy only when genuinely known (API connection, account lookup, importing runs). Offer Retry/reconnect/back without discarding drafts. Never present fake percentage, fictional completed steps or “almost done” just because a timer expired.
- **Completion**: switch to actual ready content immediately; do not artificially keep the loader for “marketing”, except the **existing explicit plan-builder film** which has its own product contract.
- **Brand**: existing runner poses and running cartoon; no replacement stock animation, no new colour/font palette, no import of animation libraries without justification.
- **Accessibility**: aria-live polite / role=status once per wait, no noisy repeated announcements, reduced-motion static runner, no keyboard trapping, focus restoration, touch targets at least 44px, no excessive GPU/CPU loops when tab is backgrounded. Animation must run in browser and installed PWA, in light and dark modes.

## First implementation tasks (code, not just a UX spec)

1. **Finish adoption** of `RunnerLoading` or the existing account warm-up across remaining raw `loading-line`, `wait-spinner`, `skeleton-stack` and lazy `Suspense` cases. Prefer one shared component with compact/full variants and content-specific labels. Do not replace useful context-rich placeholders with giant full-screen cartoons.
2. **No loading flash for fast navigation.** Measure whether a ~150–250ms delayed *visual* transition prevents flicker for fast cached reads; do not delay requests/results. Keep accessible status accurate and test fake timers/unmount.
3. **Fast, truthful state ownership.** Never render the builder/Home of the previous user before `auth.sessionReady`. Maintain previous successful data only for the same authenticated owner. Ensure error states replace loaders, retries cancel prior responses and navigation away stops timers/fetches.
4. **API and UX latency profiling.** In CI and local staging-like conditions, measure boot, authentication initialization, /me, saved plan, race catalogue, run list, run detail, background Strava synchronization, lazy chunks. Distinguish network, SQL cold start, JS bundle and rendering. Report *actual* elapsed time, request count and which stage blocked first meaningful content. Avoid production account or database mutation.
5. **Avoid unnecessary work.** Check duplicate `/me` and plan fetches, looped health polling, re-rendering long lists, stale retries, modules eagerly loaded, and duplicate Strava refresh. Make only scoped optimizations with regression tests; never cache bearer tokens in service-worker response caches.
6. **Loading/error matrix.** For each primary screen, explicitly test fast success, 3-second wait, 12-second wait, offline, 401, 429, 500, timeout, request abort, retry and Back. Confirm run logging, saved plan and offline drafts survive.
7. **Responsive visual QA.** Screenshot real loading states at 320/375/390/768/1024/1440/2560 widths, both themes, and reduced motion. Verify notches/safe areas, fixed bottom nav, horizontal overflow and colour contrast. Include iPhone/iPad WebKit, Android Chromium and Firefox, plus physical iPhone owner-assisted checks.
8. **Test plan-building film separately.** Starts on click, retains original five scenes, run happens in parallel with API, no competing spinner, fewer unnecessary visual blocks, user sees a success/error after the story. Reduced motion still gets immediate feedback. Don't remove the film.
9. **No false happiness.** A genuinely failed API request must surface an actionable failure instead of an infinite running animation; never mislead users that data is saved or synced when it isn't.

## Automated acceptance / evidence

- Unit tests for `RunnerLoading` presence, label, compact form; branded waits in `FindingPlan`, `ActivityPage`, `MyRuns` and route Suspense.
- Integration tests for timeouts/retries: a successful fast request has no forced delay, an old fetch cannot overwrite new screen state, retries stop on unmount, no private content for missing token, and no duplicate run submissions.
- Playwright: initial startup offline/online, Home → Plan → Calendar → Strength → Runs → run analysis → Account → Home, rapid tab switching, slow and failing API, browser Back, reload, standalone-like mobile profiles, all themes.
- Compare before/after load time and byte/CPU cost; include findings and actual test numbers in `docs/qa/2026-11-24/runner-waits-results.md`.
- Run frontend lint, typecheck, unit tests, backend tests if affected, full Playwright matrix and secret scan. Do not mark tests skipped to win green CI.
- Screenshots are safe to share only without personal runner data, auth tokens, email codes or secrets; use synthetic accounts. **Do not assert physical-device verification from Playwright emulation.**

## Claude completion instructions

Use this PR branch as the **only** work branch for loading/performance UX. Other work continues in PR #315 for Entra. You may fix non-auth loading defects here, but if an authentication bug is uncovered, report it with reproduction steps on PR #315 rather than duplicating its change. Implement code and tests, not just comments. Keep the new UI calm and compact; show the runner purposefully and avoid text walls, popups, fake percent complete, persistent tips or extra pause/next controls. Keep the original **Night Run** colors, typography, running animation, and both modes.

Update this handover with changed files, before/after screenshots, CI links, QA failures and fixes. Commit to this PR, run full checks, and leave open for review/staging QA. **Never merge or release to production automatically.**

## Results (24 November 2026)

Tested code SHA: **`b0fdb2c`** (`b0fdb2c4c05c07678d089f135590ce1e2e99dd13`). The performance numbers below come from `ddeeb04`; later commits add the health-check pause and the extra tests, and change no request paths. The commit after `b0fdb2c` changes only this document and `docs/qa/2026-11-24/runner-loading/`.

### How it was measured

`client/e2e/loading-performance.spec.ts` drives the real app (the `journey.html` fixture: real React screens and hooks, synthetic account and API). Every API call gets a fixed **300 ms** of latency so the numbers show the request waterfall, not the runner's machine. It signs in cold (no saved copy on the device), waits for Today, then taps Plan → Runs → Journey → Account → Home → Runs. For each step it records the requests made, any duplicates, the network time from the tap to the last response, and every loader that was added to the page. A second test makes `/me` take 3 s (a slow account or database wake).

It runs in CI only: desktop Chromium in the main suite, plus Android Chromium, iPhone WebKit, iPad WebKit and desktop Firefox in the connections matrix. Nothing heavy was run on a laptop. JSON is in `runner-loading/before` and `runner-loading/after`, and every run uploads it as the `loading-performance-*` and `connection-qa-*` artefacts.

- Before: [run 45339875361](https://github.com/Menzi-Thami/start-line/actions/runs/45339875361) on `08b5c46` (spec only, app unchanged). All 11 jobs green.
- First fixes: [run 45342682386](https://github.com/Menzi-Thami/start-line/actions/runs/45342682386) on `454c578`. All 11 jobs green.
- Performance fixes complete: [run 45344423403](https://github.com/Menzi-Thami/start-line/actions/runs/45344423403) on `ddeeb04`. 10 jobs green; iPhone WebKit was cancelled by the 20-minute job limit while installing WebKit, before any test ran.
- Extra coverage: [run 45347819895](https://github.com/Menzi-Thami/start-line/actions/runs/45347819895) on `ad23a74`. Every new test passed except one wrong assertion (the Home URL has no `?view=`), fixed in `b0fdb2c`.
- Tested head: [Checks run 45349617190](https://github.com/Menzi-Thami/start-line/actions/runs/45349617190) and [secret scan 45349617086](https://github.com/Menzi-Thami/start-line/actions/runs/45349617086) on `b0fdb2c`. All 11 jobs green, including iPhone WebKit.

### Before and after (desktop Chromium, 300 ms per call)

| Step | Before: requests / network | After: requests / network | Loader the runner sees |
|---|---|---|---|
| Cold start to the last startup response (Today's data) | 13 / 1,827 ms, four calls in a chain after `/me` | 13 / 1,507 ms, three | Unchanged: "Checking your account", then the Today skeleton |
| Open Plan from Home | 7 / 1,038 ms; `/me/calendar` read twice; plan regenerated, then coached | 5 / 362 ms; no duplicate, no regenerate | The plan shows from the coached copy; the coach read refreshes it |
| Runs, first visit | 4 / 944 ms | 4 / 631 ms | "Loading your runs…" **gone**: the list shows at once while it refreshes |
| Journey | 3 / 631 ms; `/me/journey` read twice | 2 / 631 ms | Unchanged |
| Account | 4 / 628 ms | 4 / 631 ms | Unchanged (the reminders line is now the runner) |
| Back to Home | 7 / 333 ms | 7 / 336 ms | Today skeleton **gone**: the last plan shows while it refreshes |
| Runs again | 4 / 637 ms | 4 / 342 ms | "Loading your runs…" **gone** |

Same steps on the other engines (network time to the last startup response, then Plan, before → after):

| Engine (Playwright emulation) | Startup | Open Plan |
|---|---|---|
| Android Chromium | 1,663 → 1,491 ms | 1,000 → 378 ms |
| Desktop Firefox | 2,026 → 1,487 ms | 1,081 → 390 ms |
| iPad WebKit | 2,022 → 1,713 ms | 1,064 → 423 ms |
| iPhone WebKit | 2,035 ms → no after figure (job cancelled at WebKit install) | 1,062 ms → no after figure |

With a 3 s account wake, Today arrives at about 4.4–4.9 s both before and after. The wake itself dominates, and nothing here touches `/me` or its timeout. `todayReadyMs` in the JSON follows Playwright's expect polling steps (100/250/500/1,000 ms), so it is too coarse to compare; the network times above come from request timestamps.

### What changed and why

Causes of slowness, fixed:
1. **Home waterfall.** `/me/plans` → `/me/plans/{id}` → `POST /coach` → check-ins and Strava completions ran one after another. The plan list already gives the id, so the coach read, check-ins and completions now start alongside the plan details (`useCurrentPlan.pendingId`, `useHomePlan`, `Home.readPlanId`). Anything that *changes* the plan still waits for the confirmed plan. Nothing is shown until the plan itself is known.
2. **Opening Plan regenerated the plan** (`POST /api/v1/plans`) and only then asked for the coached copy. The coached copy Home keeps on the device is now shown straight away, and the coach read refreshes it (`App.fetchPlan`). A different plan, a link, or no copy still builds as before; offline is unchanged.
3. **Duplicate reads.** The calendar secret is read once per account per visit (`useCalendarLink`). JourneyPage uses the app's journey instead of a second copy.
4. **Runs and Home repeated their loaders on every visit.** The last recordings and the last Home plan are kept in memory (never in storage) for the same account only. A Strava copy past its `cachedUntil` is never shown from memory.
5. **Strava catch-up** read the recordings a second time on every mount; now it does so only when the catch-up changed the import status.
6. **Health checks in the background.** During a slow account wait, `/health` was polled every 3 s even with the app in the background. It now pauses while hidden and resumes when the app is visible (`useWakeStep.pauseWhileHidden`).

### Slow 3G (DevTools preset: 400 ms, 50 kB/s; Chromium only, production build from `vite preview`)

| Measure | Desktop Chromium | Android Chromium |
|---|---|---|
| Branded boot screen visible | 3,240 ms | 3,238 ms |
| App shown (boot screen gone) | 6,035 ms | 6,035 ms |
| Network idle | 9,023 ms | 9,001 ms |
| Requests / transferred | 11 / 987 KB | 11 / 987 KB |

`vite preview` serves files uncompressed, so 987 KB is an upper bound; production transfer should be smaller if the host compresses. A cold load never shows a blank page: the static boot screen is in `index.html`. Firefox and WebKit have no DevTools network throttling, so this test is skipped there and says so.

Loading states:
- `RunnerLoading` fades in after about 220 ms, using CSS only with its space held, so fast loads never flash a loader and nothing waits for it. Retry, Back and Sign out sit outside the live region. The runner's motion stops after about 5 s on every wait, so nothing loops forever (WCAG 2.2.2). Reduced motion shows a still runner.
- **Pause/Resume warm-up control: removed, along with the rotating tips.** It only existed because the tips changed on their own. With no auto-updating text and finite motion there is nothing to pause, and it was the extra control the owner flagged. The slow wait now shows the runner, the real wake step (server → database → account), Try again and Sign out.
- `FindingPlan` announces its slow-wait reason again; it had fallen outside the live region.
- The last raw loaders now use the shared runner: session check, plan rebuild, running tools, milestones, day sheet, reminders, Strava connect, and file import (real counts, no percentage). Tile-shaped skeletons (Today, totals, race list, Strava row) stay where they hold layout.
- The five-scene plan film is untouched: same 17.5 s, starts on Build Plan, API in parallel.

Not changed: API timeouts (60 s read, one retry on 0/502/503/504), auth code (PR #315 owns it; coordination note posted there), and the service worker.

### QA table

| Check | Result | Where |
|---|---|---|
| Unit tests: RunnerLoading, FindingPlan, SignInWait, useSyncedRuns cache and catch-up, parallel Home reads, calendar read-once, Home revisit, owner isolation | Pass (targeted local runs; full suite in CI `frontend`) | CI |
| Request counts, duplicates and waterfall across five engines | Pass, asserted in `loading-performance.spec.ts` | CI |
| Slow account (6.5 s) → runner and plain status → 60 s timeout → error with Try again → recovery and navigation | Pass | `account-loading-recovery.spec.ts`, CI, all engines |
| Light/dark, reduced motion, 320/375/820/1440 widths, axe WCAG 2.2 AA on the slow-account wait | Pass | Same spec |
| Runs wait at 768, 1024 and 2560 px, light and dark: no horizontal overflow, runner capped at 560 px, navigation usable mid-wait | Pass | `loading-states.spec.ts`, CI, all engines |
| Slow 3G cold load: boot screen, then app, timings and bytes recorded | Pass | Same spec, Chromium (desktop and Android) |
| Backgrounding: wake checks stop while hidden for 30 s, resume when visible, Try again still offered | Pass | Same spec, all engines; unit tests in `useWakeStep.test.ts` |
| Browser Back while a run is loading: back to the list, late answer ignored, Forward asks again, no page errors | Pass | Same spec, all engines |
| Six quick tab changes at 1.2 s per call: ends on Home with Today, no loader left, no page errors | Pass (on `b0fdb2c`) | Same spec, all engines |
| 401/429/500, offline drafts | Existing specs pass (e.g. `offline-check-ins`, `mobile-usability`, `simplicity`) | CI |
| Plan film | Unchanged; `plan-theatre.spec.ts` passes | CI |
| Physical iPhone PWA | **Not done**: needs the owner | Owner |
| Staging build | **Not done**: PR left open, nothing merged or deployed | Owner |

Failures found and fixed on the way: the first journey measurement went blank on opening Plan because the mock answered the plan generator with `[]`. That was a test fixture gap (fixed in `08b5c46`), not an app bug. The first fix round left Today waiting on check-ins (found in run 45342682386, fixed in `ddeeb04`).

Screenshots (synthetic data) are in `docs/qa/2026-11-24/runner-loading/`: the Runs wait at 768 px (light, desktop Chromium; dark, Android Chromium), 1024 px dark and 2560 px light and dark; the Slow 3G ready screen; the compact account wait on desktop, iPhone WebKit and Android Chromium; the timeout with Try again in dark mode on iPhone WebKit (from `454c578`); and Runs at the end of the journey on desktop. All are Playwright emulation, not physical devices.

## QA sign-off checklist

- [x] All loader visuals follow one branded runner language, with small/full variants
- [x] Fast routes are not slowed down by animations and no unrelated full-screen blockers appear
- [x] No indefinite loader on API failure/offline/expired session (account timeout verified; motion is finite everywhere)
- [x] Real retries, back navigation and cancellation work without losing data (Back/Forward mid-load and quick tab changes tested)
- [x] Saved data and auth remain owner-isolated (memory caches keyed by account, tested)
- [x] Full builder cartoon film starts at Build Plan, has no duplicate spinner and preserved motion preference (untouched)
- [x] All primary pages run correctly on mobile/tablet/desktop and dark/light (CI emulation, including 768/1024/2560; not physical devices)
- [x] Automated test suite and secret scan green for the tested code commit `b0fdb2c` (the docs-only commit after it skips the browser jobs)
- [ ] Staging screenshots, measurements and physical-device results labeled accurately (CI emulation labelled; staging and device pending)
