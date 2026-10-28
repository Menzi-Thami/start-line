# Actual running and sharing verification

This change makes completed running visible beside the prescription, including different workouts, manual time-only entries, additional runs and linked imports. Upcoming coaching changes require a preview and an explicit apply action. The README and [testing guide](../../testing.md) describe the current workflows and database isolation.

## Isolation and scope

All persistence and browser-account checks used disposable local SQL Server databases, synthetic runners and test authentication. No production database, Azure resource or real runner's Strava account was used. The test factory now rejects remote SQL hosts and non-test database names before starting its host.

The full account browser journey exercised the actual React app and API against SQL through a temporary local WebApplicationFactory proxy. The proxy's synthetic identity and browser entry point were outside production entry points and removed from the checkout after testing. Strava data was synthetic, seeded through the domain model; no Strava network request was made. Backend API tests also verify a new authenticated client can retrieve a saved different run without changing its plan.

## Feature browser checks

- Logged an additional run with **42:10** duration alone; it added no invented kilometres and did not complete a prescribed workout.
- Logged **10 km, 1:00:00, Easy long run** against a different prescribed session. The generated prescription remained byte-for-byte unchanged.
- Cleared local storage and reloaded; the saved actual run still appeared from SQL.
- Classified one synthetic Strava activity first as additional, then removed that entry and linked the same activity as a replacement. Only one link existed; imported distance/time were not copied into permanent manual fields or permanent totals.
- Verified responsive layouts without horizontal overflow at **375, 820 and 1440px**, with reduced motion enabled.
- Downloaded the real rendered **1080 × 1280 RGBA PNG** and verified transparent margins. Copied the PNG and read back `image/png` from Chromium's clipboard.
- Closed the sticker preview with Escape and checked that reviewing coaching did not mutate the saved plan.

Backend coverage protects unknown distances, exact actual values, original session identity, idempotent additional-run saves, ownership, duplicate import links, easy substitutions, stale proposals, explicit coaching approval and history on past dates. Frontend coverage includes completion logging, error/retry, imports, miles editing, additional runs, unknown metrics, sticker downloads and coaching previews. A browser regression also checks PNG previews under the production content-security policy.

## Validation

`scripts/check.sh` passed in full on this branch:

- Backend: **819 domain, 103 application, 7 architecture and 218 SQL integration tests** passed (**1,147 total**); strict Release build and formatting passed.
- EF model/migration consistency passed. EF CLI 10.0.12 reports a nonblocking version notice against runtime 10.0.13.
- Frontend: **515 tests in 62 files** passed with one worker; lint, TypeScript, production build and dependency audit passed (zero npm audit vulnerabilities).
- Standard Playwright suite: **26 desktop/phone tests** passed against its local API and production frontend, including the production image-policy regression.
- The additional account/browser journey described above passed **13 feature checks** against isolated SQL.

The production main bundle is about **455 kB (140 kB gzip)**; the image renderer is a separate **2.62 kB** chunk. The final diff was reviewed, and temporary test entry points were removed before delivery.

## Evidence

- [Generated sticker](evidence/run-sticker.png)
- [Phone sticker preview](evidence/run-sticker-phone.png)

The sticker renderer loads when its preview is opened and generates the image on the device. No exported image is saved in SQL.

## Remaining verification

Live Entra authentication, a physical iPhone/Android device and actual Instagram/native share-sheet behavior were not exercised. Native sharing and image pasting depend on the device/app; Save PNG remains the fallback. Strava-linked details follow the existing seven-day cache. Manual entries remain the runner's own record. Midweek coaching that would rewrite past workouts is blocked; the existing replan flow can rebuild from next Monday.
