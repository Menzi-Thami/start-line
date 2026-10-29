# Plan/run lifecycle audit — 29 October 2026

This audit covers sequences and state combinations, not a claim that every possible application state has been tested. Never use production runner data or SQL for these checks.

| Sequence / boundary | Evidence |
| --- | --- |
| Planned Wednesday run → different run days + goal + strength → repeat edit → later start → reopen → correct original run | SQL `PlanEditHistoryTests`, manual, time-only, plain tick, Strava, upload and additional variants |
| Same record ID, original date, feedback, manual values and association after editing | SQL assertions against persisted records; browser app reload journeys |
| Legacy plain completion with no captured prescription → schedule changes | SQL baseline capture and immutable original prescribed kilometres |
| Bookkeeping snapshot → later data reads | SQL check-in answer timestamp remains unchanged |
| Source expires after edits | SQL verifies retained completion/unknown measurements without copying cached metrics |
| Failed/stale/invalid update; another runner's request | SQL conflicts/validation and ownership assertions; browser failed save/retry |
| Plan removal after recording runs | SQL archived schedule and unchanged running totals |
| New forged check-in on a historical non-session | SQL rejects it while permitting edits to an existing own record |
| Actual app: log Wednesday → change days/add strength → failed save → retry → reload → change goal/start → double-click submit → calendar outside new start | `plan-edit-history.spec.ts`, synthetic authentication with real plan generation; SQL persistence validated separately |
| Hidden strength → open → tick → close/reopen; switch plan/Strength views | `StrengthPresentation.test.tsx` and browser keyboard/viewport checks |
| Delayed hour wheel event after minutes were edited | `TimeWheel.test.tsx`; reproduced failure on old code (`2:52` instead of `2:50`) |
| Replace a selected goal time with keyboard text | Browser reproduction isolated to a clipped native input; visible-on-focus field retains `52` → `50` |
| Strength instructions when printing, then return to compact workouts | Browser before/after-print event checks preserve the closed state afterward |
| Historical start and generator version after availability edit | `StrengthDays.test.tsx` |
| Strength update → sign out → clear local storage → sign in | `strength-persistence.test.tsx`, historical v1, custom-start v2 and replanned v2; one save despite double-clicking |
| Plan removal → account export → account deletion | SQL retains/export check-ins after schedule removal, then verifies account deletion erases them |

Confirmed defects found: schedule edits were treated as fresh builds; unsaved previews detached from account check-ins; orphaned completed prescriptions were omitted from the calendar; plain-tick totals were regenerated from new prescriptions; old runs could not be corrected after schedule/start changes; plan deletion cascaded into saved run logs; delayed duration-wheel callbacks could overwrite another field; replacing selected text in a clipped time field could clear its value. These changes address those paths. Existing endpoint and snapshot compatibility is checked by the complete merge gate.

Testing boundaries: browser accounts/API persistence are synthetic stand-ins, plan generation uses the real local API, and separate SQL tests exercise real API/database transactions. Source variants reuse deterministic generated fixtures to avoid exhausting the real local API rate limit; production limits are unchanged. Chromium phone emulation is not physical iOS/Android/WebKit or live Entra/Strava authorization. Temporary provider-cache expiry is not permanent portfolio storage. Account deletion remains intentionally destructive; archived-plan browsing/editing and device-local strength history are existing product limits. The expected plan ID guards replacement by a different race; it is not an optimistic revision lock for simultaneous edits to the same race.

The complete `scripts/check.sh` gate passed on source `ccc38f4ac683382c7477e3866c8c6f2c19b31f35`. The subsequent commit records documentation/screenshots only.

- Backend formatting and strict Release build: passed, 0 warnings/errors.
- **1,204 backend tests:** 848 domain, 103 application, 7 architecture, 246 disposable local SQL integration; no failures/skips. EF model/migration consistency passed.
- Frontend lint/TypeScript and **573 tests across 68 files:** passed.
- Production build: passed. Main JavaScript 474.05 kB / 144.64 kB gzip; the day summary remains lazy at 8.02 kB / 2.76 kB gzip. Dependency audit: **0 vulnerabilities**.
- **58 Playwright journeys:** passed in Chromium desktop and phone emulation. The eight new plan-edit journeys include the complete log/edit/failure/retry/reload/start/calendar sequence, double submission, keyboard strength progress and print-state restoration.
- Layout checks include 375, 820 and 1440 px for compact strength, with the full existing suite spanning 320–2560 px. Keyboard and reduced-motion checks passed. Reviewed the screenshots below and final diff.

The first gate exposed an existing test that expected plan deletion to erase check-ins. It now verifies preservation/export after plan removal and erasure after account deletion. Older strength tests requiring a second Save changes action now exercise the single save, double-click, retry and fresh-sign-in paths without dropping their historical metadata assertions.

Screenshots from synthetic browser journeys: [retained run after changing Wednesday to rest](retained-run-phone.png), [compact phone strength](strength-phone.png), [tablet](strength-tablet.png), [desktop](strength-desktop.png), [keyboard time entry](keyboard-time-entry.png).
