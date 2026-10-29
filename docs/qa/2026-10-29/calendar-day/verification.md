# Calendar day summary verification — 29 October 2026

Scope: tappable weekly/monthly dates, planned and recorded sections, mobile sheet/desktop panel, existing logging/editing/sharing flows, activity markers and accessibility. All data is synthetic; SQL validation uses the existing disposable loopback test database, never production.

Focused browser verification: six desktop/phone journeys passed. Widths 375, 820, 1440 and 2560 px have no horizontal overflow in the day summary or page. Reviewed the attached phone rest-day and desktop replacement screenshots. Native focus containment and return, reduced motion, source linking, manual/time-only saves, reload, editing, cache deletion and failed/successful deletion are covered.

The first browser pass exposed focus escaping the sheet's controls in reverse tab order; explicit first/last control wrapping now complements native dialog background isolation. A test persistence stub also needed the existing additional-run DELETE route's ID-only shape; the final browser pass validates deletion survives the stub's saved state.

Full merge gate: pending. Results are recorded in the pull request after scripts/check.sh completes on the feature commit.

Limits: Chromium phone/tablet emulation, not physical iOS/Android/WebKit. Live Entra, Strava and device sharing sheets were not exercised. Imported source retention is unchanged; selecting a day does not backfill old provider history. Strength ticks remain device-local. No backend/API/schema/migration or training-rule changes.
