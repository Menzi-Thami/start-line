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
| Historical start and generator version after availability edit | `StrengthDays.test.tsx` |

Confirmed defects found: schedule edits were treated as fresh builds; unsaved previews detached from account check-ins; orphaned completed prescriptions were omitted from the calendar; plain-tick totals were regenerated from new prescriptions; old runs could not be corrected after schedule/start changes; plan deletion cascaded into saved run logs; delayed duration-wheel callbacks could overwrite another field. These changes address those paths. Existing endpoint and snapshot compatibility is checked by the complete merge gate.

Testing boundaries: browser accounts/API persistence are synthetic stand-ins, plan generation uses the real local API, and separate SQL tests exercise real API/database transactions. Chromium phone emulation is not physical iOS/Android/WebKit or live Entra/Strava authorization. Temporary provider-cache expiry is not permanent portfolio storage. Account deletion remains intentionally destructive; archived-plan browsing/editing and device-local strength history are existing product limits.

Validation is still in progress. Final counts and tested commit are recorded before merge.
