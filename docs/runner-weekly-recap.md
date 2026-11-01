# Runner weekly recap rollout

This branch **replaces** the maker-only `WeeklyReportWorker` with `RunnerWeeklyRecapWorker`. The old report is not scheduled once this code is deployed. The old `Report__To` and `Report__SendTestTo` settings are ignored by the new worker.

## Safe first test

1. Deploy after CI. Leave `RunnerWeeklyRecap__Enabled=false` (the default), so no runner receives a scheduled email.
2. Set `RunnerWeeklyRecap__TestTo` to the **verified email address of the account owner**, in App Service configuration (never commit the address). Restart once; one synthetic preview will be sent through Brevo.
3. Inspect Gmail/iPhone and Outlook desktop for typography, responsive 560px Frame layout, light/dark inbox behavior, fallback fonts, mascot and accessible plain text. The preview includes fake metrics (3 runs, 24.5 km), not another runner's data.
4. Clear `RunnerWeeklyRecap__TestTo` after approval to prevent another preview on each restart.
5. Enable weekly delivery separately only after verifying opt-in and delivery protections. `RunnerWeeklyRecap__Enabled=true` turns on Monday 07:00 SAST weekly mail for opted-in runners.

## Important production limitations

- Email clients generally strip scripts and CSS keyframe animations. The layout is static and built from the existing Frame `EmailLayout` (grey page, white card, sage, serif headline, mascot); avoid pretending that web transitions will play in recipients' inboxes.
- The initial worker queries available activity records for the preceding seven local *SAST* days, not individual runner timezones; Strava data can disappear after seven days. It makes **no claim** to all-time totals.
- A production rollout needs durable per-runner delivery idempotency, timezone-aware scheduling, an unsubscribe flow appropriate for the weekly-emails preference, and protection against stale provider data. **Do not enable general delivery until those controls are implemented and tested.**
- This work is intentionally configured test-first, with the report worker disabled on deployment.
