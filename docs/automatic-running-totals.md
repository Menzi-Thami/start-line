# Automatic running totals

Home's month, year, weekly average and 12-week chart now count available Strava runs automatically. A runner does not need to tick a planned workout or re-enter imported measurements for the distance to appear. Logging remains a separate choice about how a run fits the plan; viewing totals never completes workouts or accepts coaching changes.

Home requests GET /api/v1/me/running?includeSynced=true. Omitting the new query flag preserves the existing saved-only response behavior. The current view resolves owned activities and check-ins on each read:

- A currently available Strava activity contributes its actual distance, including on a rest day or without a saved plan.
- A linked completion and its activity count once. Explicit independently entered distance takes precedence over imported distance, and remains after imported details expire.
- Distinct activities on one date count separately. Explicit unlinked additional entries remain separate; the app does not guess that two additional runs are the same solely from their date.
- A plain planned tick does not add estimated planned kilometres on top of a recording on the same day. Original prescriptions and completion states remain unchanged.
- Expired imports are excluded even before cleanup deletes them. A saved completion whose distance is unavailable remains a counted run with unknown distance, not a fabricated zero-distance run.

The UI labels the Strava contribution in month/year figures. It refreshes totals after check-ins, changes to the activity list, returning to the visible app, and the next known imported-cache deadline. This adds no polling or provider API calls. HTTP responses and requests use no-store; computed totals are not saved to SQL, local storage or the service worker. No schema migration or new persistent Strava index is introduced. Coaching's durable evidence boundary is unchanged.

Strava deletion, disconnection or expiry can remove an imported contribution from the current figures; the UI explains this. Independently entered measurements and uploaded records keep their existing retention. The current view does not claim that all historical Strava activities have been backfilled. Existing cache refresh, deletion and provider-policy review requirements remain in place.

Weekly average still means the last four **full** Monday–Sunday weeks. A run this week changes month/year/current chart, but enters that average only when its week finishes. Comparisons are unavailable when their contributing distance is unknown, rather than falsely claiming the runner is level with zero.

Regression coverage includes domain identity/distance precedence, actual SQL/API reads without saving imported metrics, default API compatibility, cache expiry, account isolation, no-plan runners, visibility/expiry refresh and desktop/phone browser journeys that reproduce the 10 km screenshot. Automated tests use synthetic data and disposable local SQL only: [testing.md](testing.md).
