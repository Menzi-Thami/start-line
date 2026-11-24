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

## QA sign-off checklist

- [ ] All loader visuals follow one branded runner language, with small/full variants
- [ ] Fast routes are not slowed down by animations and no unrelated full-screen blockers appear
- [ ] No indefinite loader on API failure/offline/expired session
- [ ] Real retries, back navigation and cancellation work without losing data
- [ ] Saved data and auth remain owner-isolated
- [ ] Full builder cartoon film starts at Build Plan, has no duplicate spinner and preserved motion preference
- [ ] All primary pages run correctly on mobile/tablet/desktop and dark/light
- [ ] Automated test suite and secret scan green for exact head commit
- [ ] Staging screenshots, measurements and physical-device results labeled accurately
