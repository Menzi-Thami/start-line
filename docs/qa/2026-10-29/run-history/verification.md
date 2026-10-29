# Run-history regression review — 29 October 2026

## Report and fixes

A runner reported that yesterday's unplanned run disappeared after logging it on a rest day. The account save path preserved the entry, but PlanView filtered the associated import out of the activity marks and WeekDays never rendered the saved additional entry in its place. Home also closed the confirmation form and removed the pending-import prompt without keeping that saved entry in the same section.

The fix renders saved additional cards on their actual calendar dates, displays the original rest/workout prescription alongside them, marks logged days in the month calendar, and keeps recent additional entries on Home. Linked imports appear once, with a route to their details while available. After cache expiry the saved card remains; unknown imported metrics stay unknown, while independently entered measurements remain.

The wider review also found and fixed failed history requests masquerading as empty successful loads, unconfirmed Strava runs briefly marking today's workout complete before check-ins loaded, and a same-date fallback hiding a distinct synced run. Initial history loading now disables account-running completion; errors offer Retry. Late refresh responses cannot undo successful edits/deletions. Account and device-only strength storage descriptions are explicit.

## Regression matrix

| Area | Boundary / expected behavior | Evidence |
|---|---|---|
| Saved-run visibility | Rest day, strength day and scheduled-running day; save → calendar → All weeks → Home → fresh load | RunVisibility tests; browser run-history journeys |
| Original prescription | Extra run never completes outstanding running or strength; original rest/session remains visible | RunVisibility, WeekGlance and week-review tests |
| Manual metrics | Independently entered distance/time survive imported cache expiry; edits update one record | RunVisibility; SQL independent-measurements tests |
| Linked metrics | Imported details visible while cached; saved entry remains when details expire, without invented distance | RunVisibility tests |
| Multiple runs | Two entries on one date appear once each; calendar exposes correct count; another same-day Strava run remains discoverable | RunVisibility and Home tests |
| Failure handling | History 503 and expired authentication are errors, save/delete 503 retain data, Retry recovers | RunVisibility and useCheckIns tests |
| Concurrency | Double-click save is idempotent; late refresh cannot restore deleted or older data | RunVisibility, useCheckIns, SQL check-in tests |
| Account boundaries | Switching plans never displays prior plan entries; API denies other users, archived writes and invalid associations | useCheckIns; SQL CheckInTests |
| Input boundaries | Time-only/unknown distances, invalid/out-of-plan/future dates, distance/time validation, skipped/substituted runs | Existing frontend/domain/application/SQL suites |
| Training compatibility | Historical v1/v2 plans, strength separation, coaching, adjustments and calendar behavior | Complete backend/frontend suites |
| Browser behavior | Reduced motion, keyboard month navigation, reload and no overflow at 375/820/1440/2560px | Browser run-history journeys plus existing Playwright suite |
| Other existing flows | Plan building/sharing, calculators, account loading/recovery, strength changes, stickers and PWA behavior | Complete frontend and Playwright suites |

Validation results and tested commit are recorded in the pull request after the required checks finish. This matrix is a set of concrete regression checks, not a claim that every possible state has been proven correct.

All SQL validation uses disposable local SQL and synthetic runner data. Browser account journeys use synthetic authentication and controlled API responses against actual React screens/hooks; the normal browser suite also uses the real local stateless API. No production database, live Strava account or real notifications are used. Live Entra authentication, physical iPhone/Android behavior and production push delivery remain separate checks.
