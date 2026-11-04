# Taperday redesign and workout evidence verification

Implementation of the approved #185 direction on draft #187, based on `main` at `6ba76a92335572f792ec497f02fc1dabef017d34`. #179 (Couch to 5K), #185 (specification) and #186 (announcement) remain separate. No merge, deployment, customer message, production database or real Strava account was used. The remote heads were rechecked: #179 `f02e0eb`, #185 `06d7f0c`, #186 `50d7c03`; main is unchanged. Comparing authored changes from each common ancestor found overlap with #179 in `BuilderForm.tsx`, `Home.tsx`, `Configurations.cs` and the EF model snapshot. No overlap with #185 or #186. Beginner generators/models/contracts are untouched; eventual integration must reconcile the shared UI and EF snapshot without reverting either branch.

## Implemented and exercised

- **Week → day → run:** seven-date mobile selector, selected-day preview and upcoming sessions; desktop vertical schedule beside its preview. Explicit preview activation opens a canonical day screen, replacing the expanding weekly summary. Week, month, Home and Progress share that screen. Browser Back/Forward, refresh, selected week/month/tab, Progress period and focus context are retained, including through the actual App's asynchronous plan fetch.
- **Day detail:** existing structured warm-up, repetitions, work, recovery, cool-down, pace, purpose, run/walk and logging controls are retained. Timed-stage distance estimates are explained. Planned and recorded values remain separate, with a clear run-analysis action. Dedicated strength days expose exercises, per-set counts and a next-set action without a nested exercise disclosure; manual set toggles, bulk completion, persistence and celebration are preserved. Future strength controls are read-only.
- **Status semantics:** a shared helper and styling distinguish confirmed completion, partial/cut-short, skipped, recorded, provisional Strava, scheduled and rest states. Mixed-session days get explicit wording. Home no longer gives an uploaded or provisional recording a runner-confirmed Done badge. No check-in is automatically changed.
- **Runs:** activity cards lead with distance, date, duration, pace and source, with an explicit analysis action. The four keyboard-accessible Overview/Pacing/Coach/Splits tabs retain shoes, source attribution, consent-aware HR context, best efforts, sharing and deletion. Pacing offers an interactive split trace, optional target band, exact selector and split table; split pace never establishes interval execution.
- **Workout structure:** a bounded domain calculation uses dense time/distance samples already acquired by the importer. It expands repeats and measures prescription windows aligned to recording start. Distance stages, timed work, stationary recovery, partial/unreached stages, 10-second pace windows and a disclosed tolerance are handled. Coverage, pace and the runner's completion answer remain separate. Sparse, implausible, missing-start or ambiguous evidence is unavailable. Multiple prescriptions or multiple same-day recordings suppress stage assessment. Refresh replaces evidence, including clearing it when unavailable.
- **Progress:** existing interactive planned/recorded volume bars; 4/8/12-week controls; an interactive line and exact table for comparable easy/recovery recordings grouped by type, approximate distance and source; a keyboard-navigable consistency calendar and date finder; milestone and personal-best cards with run/day drilldowns. Missing records are never called missed training; source-dependent milestones are explicitly not all-time record claims.
- **Other audit improvements:** Home opens today's canonical workout; Builder action layout and touch targets are consistent with safe-area padding; Account summarizes profile and live connection state, with a focusable connection shortcut and useful two-column content on desktop. Existing settings drafts, destructive confirmation and provider branding remain.

## Data and architecture boundaries

Backend evidence implementation is commit `403af47`; the final product and browser-test tree is through `59d1d07`. The migration adds one nullable JSON `Activities.WorkoutExecution` column. Existing rows remain valid and are not backfilled by fetching provider history. The OpenAPI TypeScript schema was regenerated from the local API; no plan generator version or saved-plan contract changed.

Assessment is deterministic application code. It does not send runner data to AI or another service, request extra provider streams, persist raw streams, or add HR/GPS coordinates. Derived Strava evidence lives on the existing cached activity and shares its existing expiry/deletion/disconnect lifecycle. The activity API retains ownership checks and no-store behavior. The open run screen hides expired evidence and withholds stage observations without a valid Strava lifetime. Runner-owned uploads retain their existing lifetime.

**Interpretation limit:** prescribed stages are aligned to recording start, not identified as actual watch lap boundaries. The UI calls this estimated alignment, not proof that a workout was completed as prescribed. A shorter window does not establish why the runner changed or stopped. Existing check-ins provide the optional runner explanation. No historical reprocessing or precise interval recognition is claimed.

## Executed checks

These commands were executed against the product/test tree through `59d1d07`. Earlier verification logs remain available, but do not replace the final runs.

- Strict Release solution build: 0 warnings, 0 errors. [Output](logs/wave2-backend-build.log).
- Backend suite: **1,103 domain + 127 application + 7 architecture + 342 SQL integration = 1,579 passed**, none skipped. The disposable local SQL container exercised migrations, JSON round trip, ownership, ambiguous recordings and existing activity lifecycles. [Output](logs/wave2-backend-tests.log).
- Backend formatting verification and EF pending-model check passed. [Model output](logs/wave2-model.log); successful formatting emits no output.
- TypeScript, warning-denying lint, client build and dependency audit passed; audit reports zero vulnerabilities. [TypeScript/lint](logs/wave2-client-checks.log), [build](logs/wave2-client-build.log), [audit](logs/wave2-audit.log). The existing >500 kB build advisory remains.
- Repository-wide Playwright suite: **108 passed**, none skipped, with the local production client/API and synthetic account fixtures. [Output](logs/wave2-browser-all.log). **Full frontend: 676 passed / 91 files**, none skipped, in the final sequential run. [Output](logs/wave2-client-tests.log).
- Focused Chromium redesign/lifecycle suite: **23 passed**, including widths **320, 375, 390, 430, 768, 1024, 1280, 1440, 1920**, keyboard tabs, chart selection, Back/Forward, deep-link refresh, real App route loading, calendar context, saved/edit/reload/expiry, time-only entries and failed delete/retry. Additional light theme, landscape and 200% CSS zoom cases passed. CSS zoom and browser emulation are not physical-device magnification tests. [Output](logs/wave2-focused-browser.log).

Reproduce the focused browser suite from `client/`: `npx playwright test --config playwright.redesign.config.ts`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects installed Chrome in either browser configuration. The full browser configuration also runs the production client against a local E2E API. Account browser journeys use synthetic authenticated fixtures and API responses; SQL persistence is tested independently.

## Journey coverage and corrections

| Journey / risk | Executed coverage |
| --- | --- |
| Date selection versus navigation | Selection changes preview without a check-in or day route; explicit open, back/forward, focus and refresh |
| Async App loading | Day/calendar URL survives plan fetch and refresh; Home → day → Home; Progress → day → Progress |
| Saved history | Rest/strength/running-day logs, additional versus replacement, edits, repeated submission, time-only, reload, expiry and failed deletion/retry |
| Strength | Direct exercises, next/manual sets, bulk completion and reload retain the same tracked sets |
| Evidence reliability | Slow repetitions despite full distance, time-only work, pauses, stationary recovery, partial/unreached cool-down, sparse samples, GPS noise, missing beginning, bounded repeats and ambiguity |
| Source privacy | SQL ownership denial, existing cache/deletion tests, refresh clears old assessment, immediate expired-screen guard, missing/invalid lifetime hides derived observations |
| Progress | Comparable groups exclude mismatched types/sources/distances, invalid data and out-of-range dates; calendar uses UTC date arithmetic; accessible line selector/table and date drilldown |

Browser tests written for the old inline accordion were updated to follow preview → dedicated day without removing their persistence and source assertions. Initial concurrent browser/unit execution exceeded short asynchronous loader waits; those two screen-load assertions now use the same ten-second allowance as the other App navigation helpers, and final suites run sequentially. The actual App previously stripped day/context query parameters during plan loading; that was fixed and covered independently of the lightweight fixture. Loading hidden Progress calendars lazily avoids unnecessary initial rendering. The repository-wide browser run also caught a future-plan empty-chart regression: upcoming planned weeks now remain inspectable and are explicitly labeled as planned rather than recorded history; the added regression test passed. Full stylesheet fixtures exposed intrinsic hidden-table overflow and a crowded Builder action area; both were corrected before final captures. JSDOM still prints its existing canvas/scroll stubs; real Chromium separately checks layout and interactions.

## Actual browser screenshots

All images are actual local Chromium renders using real components and synthetic runner/plan/activity data. Matching before images use original main; the fixture imports the complete shipped stylesheet stack. Screenshots are QA evidence, not campaign assets for #186. Comparable-pace and stage after images exercise additional explicit synthetic evidence scenarios; they are not claims about a real runner.

| Screen | 320 px | 768 px | 1440 px |
| --- | --- | --- | --- |
| This week | [Before](week-before-320.png) · [After](week-after-320.png) | [Before](week-before-768.png) · [After](week-after-768.png) | [Before](week-before-1440.png) · [After](week-after-1440.png) |
| Day | [Before](day-before-320.png) · [After](day-after-320.png) | [Before](day-before-768.png) · [After](day-after-768.png) | [Before](day-before-1440.png) · [After](day-after-1440.png) |
| Run / splits | [Before](run-before-320.png) · [After](run-after-320.png) | [Before](run-before-768.png) · [After](run-after-768.png) | [Before](run-before-1440.png) · [After](run-after-1440.png) |
| Progress | [Before](progress-before-320.png) · [After](progress-after-320.png) | [Before](progress-before-768.png) · [After](progress-after-768.png) | [Before](progress-before-1440.png) · [After](progress-after-1440.png) |
| Home | [Before](home-before-320.png) · [After](home-after-320.png) | [Before](home-before-768.png) · [After](home-after-768.png) | [Before](home-before-1440.png) · [After](home-after-1440.png) |
| Builder | [Before](builder-before-320.png) · [After](builder-after-320.png) | [Before](builder-before-768.png) · [After](builder-after-768.png) | [Before](builder-before-1440.png) · [After](builder-after-1440.png) |
| Runs | [Before](runs-before-320.png) · [After](runs-after-320.png) | [Before](runs-before-768.png) · [After](runs-after-768.png) | [Before](runs-before-1440.png) · [After](runs-after-1440.png) |
| Account | [Before](account-before-320.png) · [After](account-after-320.png) | [Before](account-before-768.png) · [After](account-after-768.png) | [Before](account-before-1440.png) · [After](account-after-1440.png) |

Pacing and week/day/run after captures also cover all nine requested widths. Stage evidence captures: [phone](stages-after-320.png), [tablet](stages-after-768.png), [desktop](stages-after-1440.png).

## Precise continuation checklist — retain draft status

- [ ] Complete the remaining audit composition work: simplify duplicated Home insights, strengthen Builder step hierarchy and persistent mobile navigation without obscuring review content, and finish shared CSS consolidation only with cross-screen regression evidence. This wave improves these screens but does not claim the entire design backlog is closed.
- [ ] For a future precise stage-matching feature, use reliable lap/segment evidence with confidence rules. Current recording-start windows are deliberately conservative estimates; older or sparse recordings remain unavailable. Do not infer success from kilometre splits or matching totals.
- [ ] Validate coexistence with #179's final Couch to 5K contracts after that independent work is ready. Existing time-based prescriptions and generator versions are preserved here; #179 was not absorbed or modified.
- [ ] Run the literal `scripts/check.sh` before any eventual merge. Its component gates are reported individually here; do not substitute this record for a fresh pre-merge run.
- [ ] Verify Firefox, Safari, screen readers, contrast/grayscale and physical iOS/Android/PWA behavior, including safe areas, native sharing and real text scaling. Chromium emulation does not establish these results.
- [ ] Complete product/design review against the approved wireframes and real-device acceptance. Keep #186 announcement assets and sending separate.

No merge or deployment is part of this work.
