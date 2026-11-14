# Strava race results and Finish Line validation

PR: [#263](https://github.com/Menzi-Thami/start-line/pull/263). All accounts, plans and recordings used here are synthetic. SQL checks use a disposable loopback SQL Server container; no production runner data or real Strava account was accessed.

## Behaviour

Race suggestions use the plan's race date, running activity kind and a bounded distance tolerance. A suggestion never creates a result or achievement. A single match can be confirmed directly; multiple recordings, including near-identical upload/Strava copies, require a choice first. Confirmation loads authenticated activity detail and validates the ID, date, kind, distance and full elapsed time before saving. Moving time is only a labelled preview. The runner can review the values, substitute chip time, enter a result manually or undo it.

The pending-result prompt precedes the training recap on both current and past chapters. A recording-list error keeps chapter history and manual entry available, with a retry. Failed saves retain verified values; late recording/chapter responses cannot confirm a closed form or reopen an older chapter.

The share card uses the confirmed race result, including edited chip time, and race distance where supplied. Unconfirmed suggestions and DNF/DNS results never produce a race-finished card. SVG text is escaped and bounded to the card; PNG output remains 1080 × 1920. The save button's accessible name now matches its visible label, fixing the PR's failing WCAG checks.

## Sequence coverage

| Journey / risk | Evidence |
| --- | --- |
| Existing Strava recording → explicit confirmation → elapsed time, actual distance and activity ID saved | `RaceResultForm.test.tsx`; active-plan Playwright journey; SQL `JourneyTests` |
| Archived chapter → failed confirmation → retry/double click → edit chip time → fresh load → undo | `RunningJourney.test.tsx`; past-chapter Playwright journey; SQL active/archived theory |
| Multiple matching uploads/Strava recordings → choose one → review or confirm | Form unit test and phone browser journey |
| Wrong date/kind/distance, no match, future race, invalid elapsed/moving time | Matching/form unit tests; no save or finisher assertion |
| Expired/unavailable recording; another runner's recording | Form/browser fallback tests; SQL detail/save both return 404 and no result/award |
| Recording-list failure → visible manual fallback → retry; late chapter response | Running journey tests |
| Confirmed result → PNG download/native share; no canvas → SVG fallback; long SVG labels | Training story unit tests and browser export/share tests |
| Responsive layout, themes, focus, reduced motion and accessibility | Finish Line browser matrix: 320, 375, 768, 1024 and 1440 px, light/dark |

## Validation

- Strict Release backend build: zero warnings/errors; formatting and EF pending-model check pass.
- Full backend suite passes; the expanded SQL journey suite separately passes all 18 tests, including the three new recording cases.
- Frontend typecheck, lint, all 844 tests (119 files), production build and audit pass (zero vulnerabilities).
- All 61 focused journey unit tests pass after the final prompt-order and accessibility changes.
- Full Playwright results are recorded in the PR's validation section. The script's browser stage was rerun separately after overlapping local browser processes competed for the same ports.

Reviewed captures: race suggestion at 375 px in [light](strava-race-results/race-found-375-light.png) and [dark](strava-race-results/race-found-375-dark.png); confirmed result at 1440 px in [light](strava-race-results/race-finished-1440-light.png) and [dark](strava-race-results/race-finished-1440-dark.png); the actual [exported PNG](strava-race-results/race-finish-card.png).

## Remaining release checks

Native sharing is tested with a browser stub that receives and decodes the actual PNG. This does not verify a physical iPhone/Android share sheet, Safari or Instagram. Live Entra sign-in, a real Strava sync and staging-account QA are not established by these synthetic fixtures. Complete staging and physical-device QA before production promotion.
