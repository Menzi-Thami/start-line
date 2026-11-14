# Strava race results and Finish Line validation

PR: [#263](https://github.com/Menzi-Thami/start-line/pull/263). All accounts, plans and recordings used here are synthetic. SQL checks use a disposable loopback SQL Server container; no production runner data or real Strava account was accessed.

## Behaviour

Race suggestions use the plan's race date, running activity kind and a bounded distance tolerance. A suggestion never creates a result or achievement. A single match can be confirmed directly; multiple recordings, including near-identical upload/Strava copies, require a choice first. Confirmation loads authenticated activity detail and validates the ID, date, kind, distance and full elapsed time before saving. Moving time is only a labelled preview. The runner can review the values, substitute chip time, enter a result manually or undo it.

The pending-result prompt precedes the training recap on both current and past chapters. A recording-list error keeps chapter history and manual entry available, with a retry. Failed saves retain verified values; late recording/chapter responses cannot confirm a closed form or reopen an older chapter.

Linking a run from the manual form loads its actual distance and elapsed time, retaining the runner's chosen outcome and note. An edited result holds the version the runner opened, so a background refresh cannot silently approve overwriting another device's changes. Successful writes remain visible if their following refresh fails. Account changes hide the preceding runner's history and celebrations, and invalidate token retrieval for pending writes.

A newly confirmed historical finish plays the existing race celebration, with an explicit replay afterwards. Recovery is a separate opt-in step, prefilled from the saved historical result. Reloading a past chapter never auto-plays its celebration or creates a recovery. The SQL sequence also verifies that repeating the recovery request returns the same recovery.

The share card uses the confirmed race result, including edited chip time, and race distance where supplied. Unconfirmed suggestions and DNF/DNS results never produce a race-finished card. SVG text is escaped and bounded to the card; PNG output remains 1080 × 1920. The save button's accessible name now matches its visible label, fixing the PR's failing WCAG checks.

Native sharing prepares the PNG before the tap, then invokes the share sheet within the original click handler. The browser test enforces both an active user gesture and invocation before the click bubbles out; cancellation never copies content unexpectedly. Metric labels wrap onto two lines, and the SVG test checks that runner artwork clears the headline.

## Sequence coverage

| Journey / risk | Evidence |
| --- | --- |
| Existing Strava recording → explicit confirmation → elapsed time, actual distance and activity ID saved | `RaceResultForm.test.tsx`; active-plan Playwright journey; SQL `JourneyTests` |
| Archived chapter → failed confirmation → retry/double click → edit chip time → fresh load → undo | `RunningJourney.test.tsx`; past-chapter Playwright journey; SQL active/archived theory |
| Historical confirmation → race celebration → prefilled recovery → repeated start → reload | Running journey unit/browser journeys; SQL active/archived theory |
| Manual link → recorded metrics loaded without changing outcome/note; concurrent edit conflict | Race result form regressions |
| Successful result/recovery/undo → failed refresh; late read; account changes during token retrieval | `useJourney.test.tsx` |
| Multiple matching uploads/Strava recordings → choose one → review or confirm | Form unit test and phone browser journey |
| Wrong date/kind/distance, no match, future race, invalid elapsed/moving time | Matching/form unit tests; no save or finisher assertion |
| Expired/unavailable recording; another runner's recording | Form/browser fallback tests; SQL detail/save both return 404 and no result/award |
| Recording-list failure → visible manual fallback → retry; late chapter response | Running journey tests |
| Confirmed result → PNG download/native share; no canvas → SVG fallback; long SVG labels | Training story unit tests and browser export/share tests |
| Responsive layout, themes, focus, reduced motion and accessibility | Finish Line browser matrix: 320, 375, 768, 1024 and 1440 px, light/dark |

## Validation

- Strict Release backend build: zero warnings/errors; formatting and EF pending-model check pass.
- Expanded SQL journey suite: all 18 tests pass, including recording confirmation, recovery idempotency and ownership.
- All 69 focused journey unit tests pass after the final handoff, sharing, concurrency and account-boundary changes.
- Final full repository checks, frontend totals and Playwright results are recorded in the PR's validation section for the pushed commit.

Reviewed captures: race suggestion at 375 px in [light](strava-race-results/race-found-375-light.png) and [dark](strava-race-results/race-found-375-dark.png); confirmed result at 1440 px in [light](strava-race-results/race-finished-1440-light.png) and [dark](strava-race-results/race-finished-1440-dark.png); the actual [exported PNG](strava-race-results/race-finish-card.png).

## Before / after

Before captures run the unchanged application code from the comparison base, staging commit `c3d4dee537e4b0cab18d46826b05314a88741f16`. Only the test fixture was supplied with the same synthetic Mandela Marathon chapter and existing Strava recording used for the after captures. Both Instrument Serif and Instrument Sans Variable are explicitly loaded and checked before capture, avoiding fallback-font differences between checkouts. These are local browser renders and actual downloads, not production screenshots or design mockups.

| Surface | Before | After |
| --- | --- | --- |
| 375 px, dark | [Before](strava-race-results/before-375-dark.png) | [After](strava-race-results/after-375-dark.png) |
| 375 px, light | [Before](strava-race-results/before-375-light.png) | [After](strava-race-results/after-375-light.png) |
| 1440 px, dark | [Before](strava-race-results/before-1440-dark.png) | [After](strava-race-results/after-1440-dark.png) |
| 1440 px, light | [Before](strava-race-results/before-1440-light.png) | [After](strava-race-results/after-1440-light.png) |
| Downloaded 1080×1920 training card | [Before](strava-race-results/before-training-card.png) | [After](strava-race-results/after-training-card.png) |

Historical confirmation and recovery handoff: [375 px dark](strava-race-results/historical-recovery-375-dark.png), [375 px light](strava-race-results/historical-recovery-375-light.png), [1440 px dark](strava-race-results/historical-recovery-1440-dark.png), [1440 px light](strava-race-results/historical-recovery-1440-light.png).

## Remaining release checks

Native sharing is tested with a browser stub that receives and decodes the actual PNG. This does not verify a physical iPhone/Android share sheet, Safari or Instagram. Live Entra sign-in, a real Strava sync and staging-account QA are not established by these synthetic fixtures. Complete staging and physical-device QA before production promotion.

Deployment assessment: suitable for review and approved staging QA once the final checks pass. No production promotion or automatic merge is included. This follow-up adds no production schema, configuration or API-route changes.
