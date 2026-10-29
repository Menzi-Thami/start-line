# Calendar day summary verification — 29 October 2026

Scope: tappable weekly/monthly dates, planned and recorded sections, mobile sheet/desktop panel, existing logging/editing/sharing flows, activity markers and accessibility. All data is synthetic; SQL validation uses the existing disposable loopback test database, never production.

Focused browser verification: six desktop/phone journeys passed. Widths 375, 820, 1440 and 2560 px have no horizontal overflow in the day summary or page. Reviewed the attached phone rest-day and desktop replacement screenshots. Native focus containment and return, reduced motion, source linking, manual/time-only saves, reload, editing, cache deletion and failed/successful deletion are covered.

The first browser pass exposed focus escaping the sheet's controls in reverse tab order; explicit first/last control wrapping now complements native dialog background isolation. A test persistence stub also needed the existing additional-run DELETE route's ID-only shape; the final browser pass validates deletion survives the stub's saved state.

Full `scripts/check.sh` merge gate passed with the final feature source at `18f7fb7d720e6b16e11ea9fbef006e0706b6b5cf`. Subsequent changes only record documentation/results.

- Strict Release build: 0 warnings/errors; backend formatting passed.
- Backend: **1,195 tests** (848 domain, 103 application, 7 architecture, 237 local SQL integration), no skips/failures.
- EF model/migration consistency passed; no migration needed.
- Frontend lint and TypeScript passed; **569 tests in 67 files** passed with one worker.
- Production build passed; day view is an **8.72 kB / 3.13 kB gzip** lazy chunk. Dependency audit: **0 vulnerabilities**.
- **48 Playwright journeys** passed. The production-client/font journey additionally verifies the day sheet at **320, 390, 768, 1024, 1440 and 2560 px**. The account fixture covers **375 and 820 px** too.
- Final diff reviewed. No production database, live provider or real notifications used.

The final review also found that undefined imported history could be confused with an empty date. The day view now distinguishes unloaded imports from a confirmed empty list, retains saved entries and explains how to retry loading imports.

Limits: Chromium phone/tablet emulation, not physical iOS/Android/WebKit. Live Entra, Strava and device sharing sheets were not exercised. Imported source retention is unchanged; selecting a day does not backfill old provider history. Strength ticks remain device-local. No backend/API/schema/migration or training-rule changes.
