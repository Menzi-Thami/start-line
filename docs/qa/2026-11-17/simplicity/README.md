# Simplicity implementation evidence

PR #275 continues `feature/taperday-simplicity-plan` against staging. The [canonical tracker](../../../design/taperday-simplicity-plan.md) remains the single brief.

Screens use the real application and synthetic API responses. Before captures use `2b3c43836b4044206834114e1f22c04b365e9938` (the staging presentation with the independent ID fix); after captures use the implementation branch. No real runner or production data is used. Each capture uses the same dates, recordings and lifecycle state.

## Home before and after

| State | Phone, light | Phone, Night Run | Desktop, light | Desktop, Night Run |
| --- | --- | --- | --- | --- |
| training | [Before](before/training-375-light.png) / [After](after/training-375-light.png) | [Before](before/training-375-dark.png) / [After](after/training-375-dark.png) | [Before](before/training-1440-light.png) / [After](after/training-1440-light.png) | [Before](before/training-1440-dark.png) / [After](after/training-1440-dark.png) |
| synced | [Before](before/synced-375-light.png) / [After](after/synced-375-light.png) | [Before](before/synced-375-dark.png) / [After](after/synced-375-dark.png) | [Before](before/synced-1440-light.png) / [After](after/synced-1440-light.png) | [Before](before/synced-1440-dark.png) / [After](after/synced-1440-dark.png) |
| race-review | [Before](before/race-review-375-light.png) / [After](after/race-review-375-light.png) | [Before](before/race-review-375-dark.png) / [After](after/race-review-375-dark.png) | [Before](before/race-review-1440-light.png) / [After](after/race-review-1440-light.png) | [Before](before/race-review-1440-dark.png) / [After](after/race-review-1440-dark.png) |
| race-saved | [Before](before/race-saved-375-light.png) / [After](after/race-saved-375-light.png) | [Before](before/race-saved-375-dark.png) / [After](after/race-saved-375-dark.png) | [Before](before/race-saved-1440-light.png) / [After](after/race-saved-1440-light.png) | [Before](before/race-saved-1440-dark.png) / [After](after/race-saved-1440-dark.png) |
| recovery | [Before](before/recovery-375-light.png) / [After](after/recovery-375-light.png) | [Before](before/recovery-375-dark.png) / [After](after/recovery-375-dark.png) | [Before](before/recovery-1440-light.png) / [After](after/recovery-1440-light.png) | [Before](before/recovery-1440-dark.png) / [After](after/recovery-1440-dark.png) |
| paused | [Before](before/paused-375-light.png) / [After](after/paused-375-light.png) | [Before](before/paused-375-dark.png) / [After](after/paused-375-dark.png) | [Before](before/paused-1440-light.png) / [After](after/paused-1440-light.png) | [Before](before/paused-1440-dark.png) / [After](after/paused-1440-dark.png) |
| recovery-ended | [Before](before/recovery-ended-375-light.png) / [After](after/recovery-ended-375-light.png) | [Before](before/recovery-ended-375-dark.png) / [After](after/recovery-ended-375-dark.png) | [Before](before/recovery-ended-1440-light.png) / [After](after/recovery-ended-1440-light.png) | [Before](before/recovery-ended-1440-dark.png) / [After](after/recovery-ended-1440-dark.png) |
| safety | [Before](before/safety-375-light.png) / [After](after/safety-375-light.png) | [Before](before/safety-375-dark.png) / [After](after/safety-375-dark.png) | [Before](before/safety-1440-light.png) / [After](after/safety-1440-light.png) | [Before](before/safety-1440-dark.png) / [After](after/safety-1440-dark.png) |
| settled | [Before](before/settled-375-light.png) / [After](after/settled-375-light.png) | [Before](before/settled-375-dark.png) / [After](after/settled-375-dark.png) | [Before](before/settled-1440-light.png) / [After](after/settled-1440-light.png) | [Before](before/settled-1440-dark.png) / [After](after/settled-1440-dark.png) |
| failed | [Before](before/failed-375-light.png) / [After](after/failed-375-light.png) | [Before](before/failed-375-dark.png) / [After](after/failed-375-dark.png) | [Before](before/failed-1440-light.png) / [After](after/failed-1440-light.png) | [Before](before/failed-1440-dark.png) / [After](after/failed-1440-dark.png) |

## Recording details

| Size | Light | Night Run |
| --- | --- | --- |
| Phone | [Before](before/run-detail-375-light.png) / [After](after/run-detail-375-light.png) | [Before](before/run-detail-375-dark.png) / [After](after/run-detail-375-dark.png) |
| Desktop | [Before](before/run-detail-1440-light.png) / [After](after/run-detail-1440-light.png) | [Before](before/run-detail-1440-dark.png) / [After](after/run-detail-1440-dark.png) |

## Validation record

All application/API responses use synthetic runners and canned recordings. Backend tests use the disposable local SQL database. Commands ran against the combined #273/#274 dependencies and this implementation.

| Check | Actual result |
| --- | --- |
| `scripts/check.sh` | Backend format, strict Release build (zero warnings/errors), 1,819 backend tests with no skips, EF consistency, staging-readiness checks, frontend lint/types, 1,008 frontend tests and production build passed; stopped at the required dependency audit before its browser step |
| Final frontend suite after the lookup/retry regression fix | **1,010 passed across 139 files** |
| Final frontend lint / TypeScript | Passed |
| Final desktop `simplicity` and offline browser run | **31 passed**; regenerated every after screenshot with Chromium |
| Affected navigation / coaching / history retests | **8 passed** |
| Home/wordmark return, recording origin/filters and lookup retry | **4 passed**; the new Home-return assertion failed before the route notification fix |
| Recording stages / historical logging / source expiry / Strava confirmation retests | **9 passed** |
| Firefox offline edit / reload / reconnect journeys | **2 passed**, both themes, complete Home WCAG audit, one durable write |
| iPhone/iPad WebKit offline journeys | **4 passed**, both themes; fixture-only controls now use the existing theme-aware button styles |
| GitHub checks and secret scan | Actual final SHA, run URL, job results and browser totals are maintained on [PR #275](https://github.com/Menzi-Thami/start-line/pull/275) |

The Home and recording captures check full WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags and horizontal overflow. Interaction cases cover actual recording identity and origin/filter restoration after reload, keyboard-operable tools with retained drafts, missing IDs, failed current-plan requests and retries from both Home and a fresh device, 320/390/820/2560px, 200% text size and reduced motion. Race confirmation, source expiry, independent recovery, calendar end, pauses, seek-care restrictions and newer-plan precedence retain their real API contracts.

The shared screen fixture now calls the same `applyStoredTheme()` initializer as production. Tests assert both the document theme and the theme button state after reload; all 44 image pairs were checked for distinct daylight/Night Run canvases. Each Home audit starts in a fresh document at its final width. The offline workflow audits the full Home with the real pending-draft alert, then reopens history before reconnecting. This avoids a Firefox native geometry crash when the target-size rule traverses the expanded history document. **No WCAG rule or audit assertion is disabled.** The editing, persistence and exactly-one-write assertions remain in the Firefox flow.

Local WebKit used a task-owned Debian `libGLESv2.so.2` matching the installed GL dispatch version. Its native loader was verified before using a local-only Playwright host-preflight override because the preflight checks `ldconfig` rather than `LD_LIBRARY_PATH`. The actual WebKit engine and every application/WCAG assertion ran; GitHub retains normal browser dependency installation and validation.

## Limits and readiness

### 18 November dependency security follow-up

The registry still had no official patched release for [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). All build/test consumers now resolve a private backport from the original MIT-licensed `picomatch@4.0.7` distribution, using the parser fix proposed in upstream PR #262 at `3222059ac27492d9c0147fee5c65f751bbd851ab`. Source, licence, complete patch and removal instructions are committed in [the backport directory](../../../../client/vendor/picomatch/SECURITY-BACKPORT.md).

- Verified the original npm distribution's SHA-512. Its `+(*a)` near-miss blocked and was killed at the external two-second deadline; the patched dependency completes promptly.
- The original 4.0.7 upstream suite plus the three proposed security regressions passed: **1,986 tests**, with existing assertions unchanged.
- Clean `npm ci`, **five required dependency security tests** and the unchanged `npm audit --audit-level=high` passed; the audit reports **zero vulnerabilities**. All four transitive build/test consumers resolve the same backport.
- The dependency regressions cover ordinary file discovery, literal wildcards, existing alternative matches, POSIX, Windows/bash/capture options, nested/alternative attack shapes, bracket parsing and case folding. Matching runs in child processes that can be killed independently of a blocked regex event loop.
- Latest frontend/backend/browser reruns and final GitHub check results for this change are recorded on [PR #275](https://github.com/Menzi-Thami/start-line/pull/275). Keep the PR draft while required checks are pending or failing.

This is a **proposed upstream patch, not an official release or upstream approval**. The advisory database does not recognize the private fork; the clean audit alone is not proof of the fix. The required exploit checks supplement it. The patch retains upstream's explicit safety opt-out and literalizes unsupported unsafe forms; this is not a general guarantee for arbitrary regex syntax. Replace it with an official patched release when available, retaining the security regressions. No advisory, threshold, existing assertion or WCAG rule is suppressed.

Device profiles and text-size simulation do not establish physical-device native sharing, live Strava delivery or Azure/Entra cold-start reliability. The integrated automatic warm-up improves real waiting feedback and does not promise that hosting cold starts are removed. No hosting, billing, provider retention or schema change is included. Nothing is merged or deployed.
